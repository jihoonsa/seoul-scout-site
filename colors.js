// Seoul Scout colors: one meaning per color, everywhere (map, panels, charts, buttons). style.css repeats these
// values as CSS variables (--brand, --good, ...) and map-style.js has the base map's; change them together (D75).
//
//   green     = you, our suggestions and what is good for a founder: the chosen trade and its shops, suggested
//               neighborhoods, gaps, your shop, ✓ (always with ✓ or a word when it is a status) (D94)
//   red       = risk only (always with ! and a word): closures, competitors within your shop's walk, crowded areas (D83)
//   gray      = average, no data, other stores
//   ink       = text, "here" in a chart, and what you selected (outline of a neighborhood or building)
// Text colors reach 4.5:1 on white; red competitor dots and gray store dots stay apart for color-blind readers.
// D94: one green is the service colour (it replaced D83's choice); red means risk and nothing else.

export const COLORS = {
  brand: "#1f8150",            // green marks: pins, outlines, tints, the chosen trade's shops, your shop (white text on it 4.9:1)
  brandStrong: "#1a6b40",      // green text and links (6.5:1)
  good: "#1f8150",
  goodText: "#1a6b40",
  risk: "#d92d20",             // red, risk only (4.8:1)
  riskText: "#b42318",         // (6.6:1)
  neutral: "#8a8d91",
  neutralText: "#5b5f64",
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
// a strong and a light green (D94) for fewer shops, nothing for similar, a light and a dark slate for more.
export const GAP_STYLE = [
  { upTo: -2, ...seeThrough("#7cc39d", 0.75) },
  { upTo: -1, ...seeThrough("#cfe9db", 0.55) },
  { upTo: 1, wash: "#ffffff", opacity: 0, color: "#000000" },
  { upTo: 2, ...seeThrough("#d3d8de", 0.5) },
  { upTo: Infinity, ...seeThrough("#9ea6b0", 0.7) },
];

// "All trades" view (and wishlist matches): green, deeper the more trades an area is worth a look for (D80: stronger)
export const SUGGESTED_STYLE = {
  gapOnly: seeThrough("#d7eee2", 0.5),
  one: seeThrough("#8fcaa9", 0.7),
  several: seeThrough("#3f9b6c", 0.85),
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
