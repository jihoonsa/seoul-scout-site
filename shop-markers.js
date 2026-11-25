// Shop markers on the map: the chosen trade's shops in a white circle with a green ring and icon (D94: green is the chosen
// trade, red is risk only), the extra kinds ("같이 볼 가게") in a white circle with a black ring. The legend uses the same SVG.
// White discs, as DESIGN.md says: a street of filled discs crowded out "내 가게" (round 3).
// D80: every other shop is a filled disc in its type's colour with a white icon, so a street reads by type at a glance.

import { COLORS } from "./colors.js";
import { ICON_KEYS, iconShapes } from "./icons.js";

// One colour per SEMAS map group (store_meta.json "groups"). Kept away from green (our suggestions and the chosen trade)
// and red (risk); the type's name always comes with it (filter chips, legend, building card).
export const GROUP_COLORS = {
  cafe: "#8b5a2b",        // brown
  food: "#f08c00",        // amber
  retail: "#1c7ed6",      // blue
  education: "#5f3dc4",   // violet
  beauty: "#ae3ec9",      // purple
  health: "#3b5bdb",      // indigo (not green: that is the chosen trade, D94; white icon 5.7:1)
  lodging: "#0c8599",     // teal
  other: "#868e96",       // gray
};

const STYLES = {
  main: { fill: "#ffffff", ring: COLORS.brand, icon: COLORS.brand },
  extra: { fill: "#ffffff", ring: COLORS.ink, icon: COLORS.ink },
};
const IMAGE_PIXELS = 48;   // drawn at twice the 24 px it shows at, so it stays sharp on high-density screens

function styleOf(style, iconKey) {
  if (style === "group") return { fill: GROUP_COLORS[iconKey] ?? GROUP_COLORS.other, ring: "#ffffff", icon: "#ffffff" };
  return STYLES[style];
}

// The marker as SVG: a 24 px circle with the icon 14 px wide in its middle
export function markerSvg(style, iconKey) {
  const { fill, ring, icon } = styleOf(style, iconKey);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="shop-key" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">`
    + `<circle cx="12" cy="12" r="11" fill="${fill}" stroke="${ring}" stroke-width="1.5"/>`
    + `<g transform="translate(5 5) scale(0.5833)" fill="none" stroke="${icon}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">`
    + `${iconShapes(iconKey)}</g></svg>`;
}

export function markerImageId(style, iconKey) {
  return `shop-${style}-${iconKey}`;
}

// A shop kind's icon: the founder trade it belongs to, otherwise its SEMAS map group
export function kindIconKey(subtype, meta) {
  const trade = Object.keys(meta.trade_subtypes).find((key) => meta.trade_subtypes[key].includes(subtype));
  return trade ?? meta.groups[meta.subtype_groups[subtype]].key;
}

// Every marker as a map image: 12 trade and 8 group icons, red and white, plus the 8 group discs in their colours
export async function addMarkerImages(map) {
  const wanted = [
    ...ICON_KEYS.flatMap((key) => Object.keys(STYLES).map((style) => [style, key])),
    ...Object.keys(GROUP_COLORS).map((key) => ["group", key]),
  ];
  await Promise.all(wanted.map(async ([style, key]) => {
    const image = await svgImage(markerSvg(style, key));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = IMAGE_PIXELS;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, IMAGE_PIXELS, IMAGE_PIXELS);
    map.addImage(markerImageId(style, key), context.getImageData(0, 0, IMAGE_PIXELS, IMAGE_PIXELS), { pixelRatio: 2 });
  }));
}

async function svgImage(svg) {
  const image = new Image(IMAGE_PIXELS, IMAGE_PIXELS);
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;   // the colours contain "#"
  await image.decode();
  return image;
}
