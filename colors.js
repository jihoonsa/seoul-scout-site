// Seoul Scout colors: one meaning per color, everywhere (map, panels, charts, buttons). style.css repeats these
// values as CSS variables (--brand, --good, ...) and map-style.js has the base map's; change them together (D75).
//
//   vermilion = you and our suggestions: the chosen trade, suggested neighborhoods, gaps, your shop in the simulation
//   green     = good for a founder (always with ✓ and a word)
//   raspberry = risk (always with ! and a word): competitors, closures, crowded areas
//   gray      = average, no data, other stores
//   blue      = people (foot traffic, ages)
//   violet    = cost (rent)
//   ink       = text, "here" in a chart, and what you selected (outline of a neighborhood or building)
// Text colors reach 4.5:1 on white; raspberry competitor dots and gray store dots stay apart for color-blind readers.

export const COLORS = {
  brand: "#d4401f",            // marks on the map: pins, outlines, tints, your shop (white text on it 4.6:1)
  brandStrong: "#b8361a",      // vermilion text and links (5.9:1)
  good: "#1f8150",
  goodText: "#1a6b40",
  risk: "#c22a5c",
  riskText: "#a3204d",
  neutral: "#8a8d91",
  neutralText: "#5b5f64",
  people: "#1f6fc5",
  peopleDark: "#0b4ba6",
  cost: "#6e4bd8",
  crowded: "#6a6d71",          // "more shops than similar neighborhoods": the other side of a gap
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
export const GAP_STYLE = [
  { upTo: -2, ...seeThrough("#f4b9a3", 0.6) },
  { upTo: -1, ...seeThrough("#fadccf", 0.45) },
  { upTo: 1, wash: "#ffffff", opacity: 0, color: "#000000" },
  { upTo: 2, ...seeThrough("#e6e7e3", 0.45) },
  { upTo: Infinity, ...seeThrough("#d5d7d2", 0.6) },
];

// Opening view (and wishlist matches): the same vermilion washes, by how many trades an area is worth a look for.
// Round 4: these were brand-colour opacities that matched no token; 2+ trades get a third, deeper wash.
export const SUGGESTED_STYLE = {
  gapOnly: seeThrough("#fadccf", 0.45),
  one: seeThrough("#f4b9a3", 0.6),
  several: seeThrough("#e8846a", 0.7),
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
