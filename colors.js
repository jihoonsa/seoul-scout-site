// Seoul Scout colors: one meaning per color, everywhere (map, panels, charts, buttons). style.css repeats these
// values as CSS variables (--brand, --good, ...) and map-style.js has the base map's; change them together (D75).
//
//   pink      = you and our suggestions: the chosen trade and its shops, suggested neighborhoods, gaps, your shop (D83)
//   green     = good for a founder (always with ✓ and a word)
//   red       = risk only (always with ! and a word): closures, competitors within your shop's walk, crowded areas (D83)
//   gray      = average, no data, other stores
//   blue      = people (foot traffic, ages)
//   violet    = cost (rent)
//   ink       = text, "here" in a chart, and what you selected (outline of a neighborhood or building)
// Text colors reach 4.5:1 on white; red competitor dots and gray store dots stay apart for color-blind readers.
// D83: the old vermilion default read as alarm; pink is calmer, and red now means risk and nothing else.

export const COLORS = {
  brand: "#d6336c",            // pink marks: pins, outlines, tints, the chosen trade's shops, your shop (white text on it 4.6:1)
  brandStrong: "#b8285c",      // pink text and links (6.0:1)
  good: "#1f8150",
  goodText: "#1a6b40",
  risk: "#d92d20",             // red, risk only (4.8:1)
  riskText: "#b42318",         // (6.6:1)
  neutral: "#8a8d91",
  neutralText: "#5b5f64",
  people: "#1f6fc5",
  peopleDark: "#0b4ba6",
  cost: "#6e4bd8",
  crowded: "#6a6d71",          // "more shops than its crowd would usually mean": the other side of a gap
  ink: "#141517",
  ground: "#f4f5f3",           // behind the map and outside Seoul (style.css --ground, map-style.js outside)
  store: "#5b5f64",            // a store dot when no trade is chosen
  storeMuted: "#c4c6c2",       // a store dot that is not a competitor of the chosen trade
  typical: "#d5d7d2",          // the usual Seoul shop or neighborhood, hatched next to this one's ink bar
};

// Status of a figure for a founder. Every status is shown with its icon and word, never by color alone.
export const STATUS = {
  good: { color: COLORS.good, text: COLORS.goodText, icon: "✓" },
  neutral: { color: COLORS.neutral, text: COLORS.neutralText, icon: "–" },
  risk: { color: COLORS.risk, text: COLORS.riskText, icon: "!" },
  unknown: { color: COLORS.neutral, text: COLORS.neutralText, icon: "?" },
};

// Gap map ("유난히 적음", D66): the five washes of DESIGN.md, far fewer to far more. −2 is our gap definition (D13).
// The legend and the meters show the wash itself. The map draws it see-through, so streets and parks show under it:
// its colour is darkened so that, over white land at the city view, it lands exactly on the wash (round 3: off-token).
// D80: the five classes were washes so pale that neighbouring areas looked the same. They are now clearly apart:
// a strong and a light pink (D83) for fewer shops, nothing for similar, a light and a dark slate for more.
export const GAP_STYLE = [
  { upTo: -2, ...seeThrough("#f07fa6", 0.75) },
  { upTo: -1, ...seeThrough("#fbc8d9", 0.55) },
  { upTo: 1, wash: "#ffffff", opacity: 0, color: "#000000" },
  { upTo: 2, ...seeThrough("#d3d8de", 0.5) },
  { upTo: Infinity, ...seeThrough("#9ea6b0", 0.7) },
];

// "All trades" view (and wishlist matches): pink, deeper the more trades an area is worth a look for (D80: stronger)
export const SUGGESTED_STYLE = {
  gapOnly: seeThrough("#fcd9e5", 0.5),
  one: seeThrough("#f58fb2", 0.7),
  several: seeThrough("#de4f84", 0.85),
};

// A wash drawn see-through: its colour is the one that, at this opacity over white, shows as the wash
function seeThrough(wash, opacity) {
  return { wash, opacity, color: underWhite(wash, opacity) };
}

export function underWhite(wash, opacity) {
  const n = parseInt(wash.slice(1), 16);
  const channel = (value) => Math.round(255 - (255 - value) / opacity).toString(16).padStart(2, "0");
  return `#${channel((n >> 16) & 255)}${channel((n >> 8) & 255)}${channel(n & 255)}`;
}

export function gapStyle(resid) {
  return GAP_STYLE.find((style) => resid <= style.upTo);
}

export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
