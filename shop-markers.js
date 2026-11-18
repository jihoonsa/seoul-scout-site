// Shop markers on the map: the chosen trade's shops in a white circle with a raspberry ring and icon, the extra kinds
// ("같이 볼 가게") in a white circle with a black ring (colors.js: raspberry = competitors). The legend uses the same SVG.
// White discs, as DESIGN.md says: a street of filled raspberry discs crowded out "내 가게" (round 3).

import { COLORS } from "./colors.js";
import { ICON_KEYS, iconShapes } from "./icons.js";

const STYLES = {
  main: { fill: "#ffffff", ring: COLORS.risk, icon: COLORS.risk },
  extra: { fill: "#ffffff", ring: COLORS.ink, icon: COLORS.ink },
};
const IMAGE_PIXELS = 48;   // drawn at twice the 24 px it shows at, so it stays sharp on high-density screens

// The marker as SVG: a 24 px circle with the icon 14 px wide in its middle
export function markerSvg(style, iconKey) {
  const { fill, ring, icon } = STYLES[style];
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

// Every marker (12 trade and 8 group icons, red and white) as a map image
export async function addMarkerImages(map) {
  const jobs = ICON_KEYS.flatMap((key) => Object.keys(STYLES).map(async (style) => {
    const image = await svgImage(markerSvg(style, key));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = IMAGE_PIXELS;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, IMAGE_PIXELS, IMAGE_PIXELS);
    map.addImage(markerImageId(style, key), context.getImageData(0, 0, IMAGE_PIXELS, IMAGE_PIXELS), { pixelRatio: 2 });
  }));
  await Promise.all(jobs);
}

async function svgImage(svg) {
  const image = new Image(IMAGE_PIXELS, IMAGE_PIXELS);
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;   // the colours contain "#"
  await image.decode();
  return image;
}
