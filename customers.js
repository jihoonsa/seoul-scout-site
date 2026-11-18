// The rules of the customer map "내 손님 지도" (spec 5.6, D73): who the founder's customers are, when they come,
// and how many of them each neighborhood has then. No DOM or map here, so the smoke test can import and check
// them directly; app.js draws the map and the report.

import { meets } from "./wishlist.js";

const TOP_THIRD = 2 / 3;      // "many workers" means the top third of the neighborhoods, as in wishlist.js

export const CUSTOMER_GROUPS = ["0_19", "20_34", "35_49", "50_64", "65p", "visitors"];

// Hours from `from` up to, but not including, `to` (spec 5.6)
export const TIME_BANDS = {
  weekdayDay: { dayType: "weekday", from: 11, to: 17 },
  weekdayEvening: { dayType: "weekday", from: 18, to: 22 },
  weekend: { dayType: "weekend", from: 11, to: 20 },
};

// "여가·문화에 돈을 많이 쓰는 동네" is left out: the 소득소비 data is not what residents spend (D73)
export const NARROW_KEYS = ["cheapRent", "fewClosures", "workers", "university"];

// Known keys only, once each, in a fixed order, so a link and the chips always agree
export function cleanChoice({ who = [], when = [], narrow = [] } = {}) {
  return {
    who: CUSTOMER_GROUPS.filter((group) => who.includes(group)),
    when: Object.keys(TIME_BANDS).filter((band) => when.includes(band)),
    narrow: NARROW_KEYS.filter((key) => narrow.includes(key)),
  };
}

// The chosen groups added up, hour by hour (24 numbers). `people` is one dong's entry from customers.json.
export function customerCurve(people, who, dayType) {
  const hours = Array(24).fill(0);
  for (const group of who) {
    people[dayType][group].forEach((count, hour) => { hours[hour] += count; });
  }
  return hours;
}

function bandHours(band) {
  const { from, to } = TIME_BANDS[band];
  return Array.from({ length: to - from }, (_, index) => from + index);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Groups are added up, time bands are averaged: the mean of each band's hourly mean (spec 5.6)
export function customerCount(people, who, when) {
  if (!who.length || !when.length) return null;
  const bandMeans = when.map((band) => {
    const curve = customerCurve(people, who, TIME_BANDS[band].dayType);
    return average(bandHours(band).map((hour) => curve[hour]));
  });
  return average(bandMeans);
}

// Which day curves the report draws: weekday first
export function curveDays(when) {
  return ["weekday", "weekend"].filter((dayType) => when.some((band) => TIME_BANDS[band].dayType === dayType));
}

// The hour with the most chosen people inside the chosen bands; a tie keeps the earlier band, then the earlier hour
export function busiestTime(people, who, when) {
  if (!who.length || !when.length) return null;
  let busiest = null;
  for (const band of cleanChoice({ when }).when) {
    const { dayType } = TIME_BANDS[band];
    const curve = customerCurve(people, who, dayType);
    for (const hour of bandHours(band)) {
      if (!busiest || curve[hour] > busiest.value) busiest = { dayType, hour, value: curve[hour] };
    }
  }
  return busiest;
}

// The limits the switches compare with, from customers.json's dongs (neighborhoods without a figure left out)
export function narrowReferences(extras) {
  const workers = extras.map((extra) => extra.workers).filter((value) => value !== null && value !== undefined)
    .sort((a, b) => a - b);
  return { workers: workers[Math.floor(TOP_THIRD * (workers.length - 1))] };
}

// One narrowing switch. Rent and closures are the wishlist's rules over all trades.
export function meetsNarrow(key, dong, extra, refs, wishRefs) {
  switch (key) {
    case "cheapRent":
    case "fewClosures": return meets(key, dong, "", wishRefs);
    case "workers": return extra.workers !== null && extra.workers !== undefined && extra.workers >= refs.workers;
    case "university": return extra.universities >= 1;
    default: return false;
  }
}
