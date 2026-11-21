// "What if I open my shop here?" A rough what-if built only from our data, not a forecast.
// For one more shop of the chosen trade at a spot, it estimates:
//   competition  shops of the trade within a 5-minute walk, and the neighborhood's gap before and after
//   sales        a range for the new shop's card sales, from the neighborhood's sales per shop today
//   survival     the chance to still be open after 1-5 years, if closures stay as in the last year
//   rent         monthly rent for a typical shop size, and its share of the expected sales
// Every part is judged good / average / risk against the Seoul median of the same trade.

export const WALK_RADIUS_M = 300;            // about 5 minutes on foot
export const SURVIVAL_YEARS = 5;
const NEAR_SEOUL_MEDIAN = 0.1;               // within ±10% of the Seoul median counts as "average"
const RENT_SHARE_GOOD = 0.1;                 // rent ≤ 10% of sales is the usual rule of thumb; above 20% is heavy
const RENT_SHARE_HEAVY = 0.2;

// Typical shop floor area (㎡) per trade, used until the founder sets their own. An assumption, shown as one.
export const TYPICAL_AREA_M2 = {
  카페: 50, 제과점: 50, 한식음식점: 66, 분식: 33, 치킨: 50, "호프·주점": 83,
  편의점: 66, 미용실: 50, 네일숍: 33, 피부관리실: 50, 세탁소: 33, 교습학원: 100,
};

// The gap score is (log(1 + shops) − log(1 + expected)) ÷ spread, and the spread is the same for every neighborhood of
// a trade. We read it back from the data (the median over neighborhoods with a clear score).
export function gapSpreadByTrade(dongs, trades) {
  const spreads = {};
  for (const trade of trades) {
    const values = [];
    for (const dong of dongs) {
      const v = dong.trades[trade];
      if (!v || v.resid === null || v.expected === null || Math.abs(v.resid) < 0.3) continue;
      values.push((Math.log1p(v.shops) - Math.log1p(v.expected)) / v.resid);
    }
    values.sort((a, b) => a - b);
    spreads[trade] = values[Math.floor(values.length / 2)];
  }
  return spreads;
}

// One more shop raises log(1 + shops) by log((shops + 2) / (shops + 1)), so the score moves up by that ÷ spread
export function gapAfterOpening(values, spread) {
  const before = values.resid;
  const after = before + Math.log((values.shops + 2) / (values.shops + 1)) / spread;
  return { before, after, shopsBefore: values.shops, shopsAfter: values.shops + 1, expected: values.expected };
}

// Quarterly card sales of the new shop, as a range:
//   low   nobody new comes, so today's spending is shared by one more shop: total ÷ (shops + 1)
//   high  the new shop sells like today's average shop
// Which end is likelier depends on the trade's pattern (D47): "room" trades lean high, "elsewhere" trades lean low.
export function salesRange(values, pattern, seoulMedian) {
  if (!values.sales_per_shop || !values.shops) {
    return { low: seoulMedian, high: seoulMedian, likely: seoulMedian, fromSeoul: true, neighborsDrop: 0 };
  }
  const total = values.sales_per_shop * values.shops;
  const low = total / (values.shops + 1);
  const high = values.sales_per_shop;
  const lean = { room: 1, unclear: 0.5, elsewhere: 0 }[pattern] ?? 0.5;
  return { low, high, likely: low + (high - low) * lean, fromSeoul: false, neighborsDrop: 1 / (values.shops + 1) };
}

// Chance to still be open after each year, if the yearly closing rate stays the same
export function survivalCurve(closeRatePercent, years = SURVIVAL_YEARS) {
  const stay = 1 - closeRatePercent / 100;
  return Array.from({ length: years + 1 }, (_, year) => stay ** year);
}

// Rent from the survey is in thousand won per ㎡ per month
export function monthlyRent(rentPerM2Thousand, areaM2) {
  return rentPerM2Thousand * 1000 * areaM2;
}

// good / neutral / risk against a reference, within ±10% counts as average
export function judge(value, reference, higherIsBetter) {
  if (value === null || value === undefined || !reference) return "unknown";
  const ratio = value / reference;
  if (Math.abs(ratio - 1) <= NEAR_SEOUL_MEDIAN) return "neutral";
  return (ratio > 1) === higherIsBetter ? "good" : "risk";
}

function judgeGap(residAfter) {
  if (residAfter === null || residAfter === undefined) return "unknown";
  if (residAfter <= -1) return "good";       // still clearly fewer than its crowd would usually mean
  if (residAfter >= 1) return "risk";        // more than its crowd would usually mean
  return "neutral";
}

function judgeRentShare(share) {
  if (share === null) return "unknown";
  if (share <= RENT_SHARE_GOOD) return "good";
  return share <= RENT_SHARE_HEAVY ? "neutral" : "risk";
}

// Everything the simulation panel shows, for one spot.
//   dong       the neighborhood the spot is in        trade, pattern   the chosen trade and its D47 pattern
//   spread     gapSpreadByTrade()[trade]              seoul            { sales, close } Seoul medians of the trade
//   nearby     competitors within WALK_RADIUS_M, nearest first        areaM2   the shop size
//   rentKnown  false when the nearest rent survey is too far away
export function simulateOpening({ dong, trade, pattern, spread, seoul, nearby, areaM2, rentKnown }) {
  const values = dong.trades[trade] ?? { shops: 0, resid: null, expected: null };
  const gap = values.resid === null ? null : gapAfterOpening(values, spread);
  const sales = salesRange(values, pattern, seoul.sales);

  const closeRate = values.close_rate ?? seoul.close;
  const survival = survivalCurve(closeRate);
  const seoulSurvival = survivalCurve(seoul.close);

  const rent = rentKnown ? monthlyRent(dong.kpi.rent_small_shop, areaM2) : null;
  const monthlySales = sales.likely / 3;
  const rentShare = rent === null || !monthlySales ? null : rent / monthlySales;

  return {
    competition: {
      nearbyBefore: nearby.length, nearbyAfter: nearby.length + 1, nearest: nearby[0] ?? null,
      gap, status: judgeGap(gap?.after),
    },
    sales: { ...sales, monthly: monthlySales, status: sales.fromSeoul ? "unknown" : judge(sales.likely, seoul.sales, true) },
    survival: {
      curve: survival, seoulCurve: seoulSurvival, closeRate, fromSeoul: values.close_rate === null || values.close_rate === undefined,
      status: judge(closeRate, seoul.close, false),
    },
    rent: { monthly: rent, share: rentShare, areaM2, status: judgeRentShare(rentShare) },
  };
}

// Distance in meters between two points (flat-earth approximation, exact enough within a city)
export function metersBetween(lng1, lat1, lng2, lat2) {
  const x = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)) * 111320;
  const y = (lat2 - lat1) * 110540;
  return Math.sqrt(x * x + y * y);
}

// A circle of a radius in meters around a point, as a GeoJSON polygon (for the 5-minute walk area)
export function circlePolygon(lng, lat, radiusM, steps = 64) {
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLng = (radiusM * Math.cos(angle)) / (111320 * Math.cos(lat * (Math.PI / 180)));
    const dLat = (radiusM * Math.sin(angle)) / 110540;
    ring.push([lng + dLng, lat + dLat]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}
