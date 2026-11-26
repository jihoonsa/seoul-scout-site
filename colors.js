// Seoul Scout colors: one meaning per color, everywhere (map, panels, charts, buttons). style.css repeats these
// values as CSS variables (--brand, --good, ...) and map-style.js has the base map's; change them together (D75).
//
//   lime      = you, our suggestions and what is good for a founder: the chosen trade and its shops, suggested
//               neighborhoods, your shop, ✓ (always with ✓ or a word when it is a status) (D111, the team note)
//   sky blue  = the map's data: every map view's tint, darker = better for a founder (D111)
//   red       = risk only (always with ! and a word): closures, competitors within your shop's walk, crowded areas (D83)
//   gray      = average, no data, other stores
//   ink       = text, "here" in a chart, and what you selected (outline of a neighborhood or building)
// Text colors reach 4.5:1 on white; red competitor dots and gray store dots stay apart for color-blind readers.
// D111 (team note 1125): lime with a gradient is the service colour (it replaced D94's green), sky blue the map views'.
// Lime is light: fills carry ink on them, marks on white use the darker lime, text the darkest. Red means risk only.

export const COLORS = {
  brand: "#65a30d",            // lime marks on white: outlines, the chosen trade's shops, your shop, chart highlights (3.1:1)
  brandFill: "#a3e635",        // lime fills, always with ink on them (12.1:1)
  brandStrong: "#4d7c0f",      // lime text and links (5.0:1)
  good: "#65a30d",
  goodText: "#4d7c0f",
  map: "#0284c7",              // sky blue: every map view's tint (D111)
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
// a strong and a light blue (D111) for fewer shops, nothing for similar, a light and a dark slate for more.
export const GAP_STYLE = [
  { upTo: -2, ...seeThrough("#86c5ea", 0.75) },
  { upTo: -1, ...seeThrough("#d4eaf7", 0.55) },
  { upTo: 1, wash: "#ffffff", opacity: 0, color: "#000000" },
  { upTo: 2, ...seeThrough("#d3d8de", 0.5) },
  { upTo: Infinity, ...seeThrough("#9ea6b0", 0.7) },
];

// "All trades" view (and wishlist matches): blue, deeper the more trades an area is worth a look for (D80, D111)
export const SUGGESTED_STYLE = {
  gapOnly: seeThrough("#dceefa", 0.5),
  one: seeThrough("#93cbec", 0.7),
  several: seeThrough("#3e9fd6", 0.85),
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
