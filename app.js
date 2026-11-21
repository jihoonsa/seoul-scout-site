// Seoul Scout: a calm map that answers one founder question at a time.
//   0. Seoul at a glance: gaps and suggested neighborhoods for all 12 trades (the opening view)
//   1. Which shop do you want to open?  ->  2. Suggested neighborhoods  ->  3. One neighborhood, in plain words
//   4. "Try opening it here": a what-if for one spot (simulation.js)      Any time: find by wishlist (wishlist.js)
//   A shop not on the list: the customer map "내 손님 지도" (customers.js)
// The map is our own: MapLibre draws an OpenStreetMap base map (data/seoul.pmtiles, see map-style.js) with the
// neighborhoods and store dots on it. Colors have one meaning each (colors.js).
// Data: data/dongs.json, data/store_meta.json, data/stores/<구>.json, data/addresses.json, data/customers.json.

import { COLORS, GAP_STYLE, STATUS, SUGGESTED_STYLE, gapStyle, hexToRgba, underWhite } from "./colors.js";
import { DOTS_MIN_ZOOM, LABELS_MIN_ZOOM, StoreDots } from "./store-dots.js";
import { DOTS_BEFORE, OUTLINE_BEFORE, TINT_BEFORE, WATER_HATCH, baseStyle, labelTexts, waterHatchImage } from "./map-style.js";
import {
  SURVIVAL_YEARS, TYPICAL_AREA_M2, WALK_RADIUS_M, circlePolygon, gapSpreadByTrade, simulateOpening,
} from "./simulation.js";
import { CRITERIA, findMatches, wishlistReferences } from "./wishlist.js";
import { initPanel, renderPanelLabels, showLeftColumn, showPanel } from "./panel.js";
import { tradeIcon } from "./icons.js";
import { closeTour, showTourStep } from "./tour.js";
import { GROUP_COLORS, addMarkerImages, kindIconKey, markerSvg } from "./shop-markers.js";
import { MAX_EXTRA_KINDS, kindsFromLink, searchKinds } from "./kind-picker.js";
import { signalLevel } from "./evidence.js";
import {
  CUSTOMER_GROUPS, NARROW_KEYS, TIME_BANDS, busiestTime, cleanChoice, curveDays, customerCount, customerCurve, meetsNarrow,
  narrowReferences,
} from "./customers.js";
import {
  formatNumber, formatPrice, formatWon, fullPlaceName, getLanguage, groupName, guName, placeName, setLanguage,
  setTradeNamesEn, surveyPointName, t, tradeName, typeName, zoneName,
} from "./i18n.js";

const RENT_FAR_KM = 2;            // beyond this the nearest rent survey says little about the neighborhood (D44)
const MAX_COMPARED = 3;
const PLAY_STEP_MS = 700;
const CLOSEST_FIT_ZOOM = 15.5;    // when fitting a small neighborhood, do not zoom in closer than this
// The tour (spec 5.7): step 1 is the welcome, steps 2 to 5 point at the real screen. Steps 4 and 5 open the spec's own
// honest example, 용답동 제과점: a gap whose 신호 세기 is 약함 (spec 5.4).
const TOUR_STEPS = 5;
const TOUR_TRADE = "제과점";
const TOUR_DONG = "11200790";        // 성동구 용답동
const TOUR_STREET_ZOOM = 16;         // close enough for the chosen trade's shop names (store-dots.js MAIN_NAMES_ZOOM)
const TOUR_MAP_BOX = [240, 160];   // px: the part of the map step 5 points at, around 용답동's bakeries
const TOUR_SHOPS_CENTER = [127.0530, 37.5627];   // [lng, lat]: between 용답동's bakeries 블레플러스 and 조잇 (none lies within 350 m of its centre)
const STREET_ZOOM = 16;           // "이 동네 가게 보기"
const ADDRESS_ZOOM = 17.5;        // a searched address
const BUSINESS_HOURS = [9, 22];   // the busiest hour shown to founders is within these hours
const SEOUL_BOUNDS = [126.764, 37.413, 127.184, 37.715];         // west, south, east, north
const MAP_LIMITS = [[126.3, 37.15], [127.65, 37.98]];             // the base map file covers this area
// How far the map may pan: the base map plus some plain ground to the south, so on a phone Seoul can rise into
// the strip above the bottom sheet (only the sheet ever sits over that ground)
const PAN_LIMITS = [[126.3, 36.75], [127.65, 37.98]];
const BASEMAP = "data/seoul.pmtiles";
const KOREAN_FONT = "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const NARROW_WIDTH = 900;        // px: below this the answer panel becomes a bottom sheet (same as style.css)
const HIT_RADIUS = 8;             // px: how close a pointer must be to pick a store dot
const SHARED_RANK_PX = 16;        // px: two pin dots closer than this share one rank, "05·06" (declutterPins)
const SEARCH_RESULTS = { dongs: 5, addresses: 6 };
const LEADS_SHOWN = 5;            // strongest leads listed in the opening view before "show all"
const SIM_ZOOM = 16.3;            // the simulation zooms no closer than this (the 5-minute walk fills a wide screen)
const SIM_NAMES_ZOOM = 17;        // while simulating, shop names show only from here (store-dots.js setNamesFromZoom)
const AREA_STEP_M2 = 5;
const AREA_LIMITS_M2 = [10, 300];
const SQUARE_METERS_PER_PYEONG = 3.3058;
const MIN_MIX_SHOPS = 3;          // below this, who buys and when describes one or two shops, not the neighborhood
const BIG_SALES_CHANGE = 100;     // %: beyond this the source's sales estimate itself moved a lot (D59)
const EMPTY = { type: "FeatureCollection", features: [] };
const NO_TINT = { color: "#000000", opacity: 0 };
// Two stacked sheets, drawn like the search box's magnifier (index.html): line icons, not text glyphs (round 4)
const LAYERS_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round">`
  + `<path d="M9 2.5 16 6.25 9 10 2 6.25Z"/><path d="M2 9.75 9 13.5l7-3.75"/></svg>`;

// Map views: what the neighborhoods are tinted by. Tints sit under the roads and labels, so the map stays readable.
// Colors follow colors.js: pink = gaps and suggestions, blue = people, green = sales, red = risk, violet = cost.
// D80: "none" comes first and is the opening view, so nothing is chosen or coloured until the founder asks for it.
const LAYERS = {
  none: { label: () => t("layerNone") },
  suggested: { label: () => t("layerSuggested"), withoutTrade: true },
  tradeGap: { label: () => t("layerTradeGap", tradeName(state.trade)), needsTrade: true, diverging: true,
              value: (dong) => dong.trades[state.trade]?.resid ?? null },
  crowd: { label: () => t("layerCrowd"), color: COLORS.people, value: (dong) => dong.hourly[state.dayType][state.hour], timed: true },
  tradeSales: { label: () => t("layerTradeSales", tradeName(state.trade)), color: COLORS.good, needsTrade: true,
                value: (dong) => dong.trades[state.trade]?.sales_per_shop ?? null },
  close: { label: () => t("layerClose"), color: COLORS.risk, value: (dong) => dong.kpi.close_rate_total },
  competition: { label: () => t("layerCompetition"), color: COLORS.risk, value: (dong) => dong.kpi.stores_per_1k_wd_day },
  rent: { label: () => t("layerRent"), color: COLORS.cost,
          value: (dong) => (dong.info.rent_area_km > RENT_FAR_KM ? null : dong.kpi.rent_small_shop) },
  customers: { label: () => t("layerCustomers"), color: COLORS.people, customersOnly: true, value: customerValue },
};
const OPACITY_STEPS = [0.1, 0.25, 0.4, 0.55, 0.72];             // 5 quantile classes, light to strong (D80: wider apart)

const state = {
  map: null, data: null, meta: null, dots: null,
  dongIndex: new Map(),         // dong code -> feature id in the "dongs" source
  bboxes: new Map(),            // dong code -> [west, south, east, north]
  pins: [],                     // neighborhood name pins on the map
  card: null,                   // the building whose card is open
  zoomBand: 0,                  // see zoomBand()
  extraKinds: [],               // "같이 볼 가게": extra SEMAS kinds shown on the map, in the order picked
  addresses: null,              // promise of the address search index, loaded on first use
  trade: "", selected: null, hovered: null, compared: [],
  layer: "none", dayType: "weekday", hour: 13, playing: null, breaks: null,   // D80: a plain map until something is chosen
  browsing: false,             // "그냥 둘러볼게요": trade question folded away
  overview: null,              // gaps and suggestions for all trades (summarizeSuggestions)
  medians: {},                 // trade -> Seoul medians { sales, close }
  gapSpread: {},               // trade -> spread of its gap score (for the simulation)
  wishRefs: null,              // Seoul reference values for the wishlist
  wishlist: null,              // chosen wishlist conditions while the wishlist is open, else null
  wishMatches: new Set(),      // codes of the neighborhoods meeting all of them
  allLeads: false,             // opening view: all strongest leads shown
  sim: null,                   // the simulation while it is open (startSimulation)
  customers: null,             // the customer map's choices { who, when, narrow, name } while it is open, else null
  customerData: null,          // promise of customers.json as { byCode, refs } (loadCustomerData)
  customerTable: null,         // the same, once loaded
};

start();
if (location.hostname === "localhost") window.seoulScout = state;   // for checking the page in the browser console

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------
async function start() {
  const settings = readLink();
  setLanguage(settings.lang ?? "en");   // English by default: the class presents in English (D86)
  try {
    const [data, meta, guBorders] = await Promise.all([fetchJson("data/dongs.json"), fetchJson("data/store_meta.json"),
      fetchJson("data/gu_borders.json")]);
    state.data = data;
    state.meta = meta;
    state.guBorders = guBorders;
    setTradeNamesEn(meta.trade_names_en);
    prepareReferences();
    // The opening panel needs only the data: paint it now instead of after the map (round 2: LCP 4.8 s).
    // renderAll redraws it once the map is ready, which is when its buttons start to work.
    if (!settings.trade && !settings.dong && settings.mode !== "customers") {
      const sheet = document.getElementById("sheet-body");
      sheet.innerHTML = homeView();
      sheet.classList.add("early");               // its buttons are not bound yet: it takes no clicks (style.css)
      sheet.setAttribute("aria-busy", "true");
    }
    await createMap();
    drawNeighborhoods();
    addBuildingHighlight();
    await addMarkerImages(state.map);
    state.dots = new StoreDots(state.map, state.meta, {
      beforeId: DOTS_BEFORE,
      onLoading: (loading) => { document.getElementById("dots-loading").hidden = !loading; },
    });
    addSimulationLayers();
    bindMapEvents();
    bindControls();
    watchTopCard();
    const customerMode = settings.mode === "customers";   // a customer map link has no trade
    state.extraKinds = kindsFromLink(settings.also, state.meta, customerMode ? "" : settings.trade);   // before chooseTrade, which writes the link
    state.dots.setExtraKinds(state.extraKinds);
    if (!customerMode && settings.trade && state.data.trade_patterns.some((p) => p.trade === settings.trade)) chooseTrade(settings.trade, false);
    const linked = state.data.dongs.find((dong) => dong.code === settings.dong);
    drawPins();                                   // the opening view pins the strongest leads (★)
    initPanel(updateSheetTall);
    if (customerMode) await openCustomers(settings);
    renderAll();
    fitSeoul({ animate: false });
    if (linked) selectDong(linked, { zoom: true });
    if (!readWelcomed()) openHelp("welcome");
  } catch (error) {
    showError(t("mapError", error.message));
  }
}

// Seoul figures every view compares with, computed once
function prepareReferences() {
  const dongs = state.data.dongs;
  const trades = state.data.trade_patterns.map((pattern) => pattern.trade);
  for (const trade of trades) {
    state.medians[trade] = {
      sales: median(dongs.map((d) => d.trades[trade]?.sales_per_shop)),
      close: median(dongs.map((d) => d.trades[trade]?.close_rate)),
      ticket: median(dongs.map((d) => d.trades[trade]?.ticket)),
      weekend: median(dongs.map((d) => d.trades[trade]?.weekend)),
    };
  }
  state.gapSpread = gapSpreadByTrade(dongs, trades);
  state.wishRefs = wishlistReferences(dongs);
  state.overview = summarizeSuggestions();
}

// Gaps (a trade far below its expected count, D13) and suggestions (gaps that passed the shortlist checks, D47)
function summarizeSuggestions() {
  const byDong = new Map();
  let gaps = 0, pairs = 0, robust = 0;
  for (const dong of state.data.dongs) {
    pairs += Object.values(dong.trades).filter((values) => values.resid !== null).length;
    const gapTrades = Object.entries(dong.trades)
      .filter(([, values]) => values.resid !== null && values.resid <= -2)
      .map(([trade]) => trade);
    gaps += gapTrades.length;
    // signal[0]: still a gap in all 5 cross-validation splits, i.e. on areas the model had not seen (D39, D72)
    robust += gapTrades.filter((trade) => dong.trades[trade].signal?.[0]).length;
    if (gapTrades.length || dong.trade_candidates.length) {
      byDong.set(dong.code, { gaps: gapTrades, suggested: dong.trade_candidates });
    }
  }
  const candidates = state.data.dongs.flatMap((dong) => dong.trade_candidates.map((candidate) => ({ dong, candidate })));
  const strong = candidates.filter(({ candidate }) => candidate.sales_per_shop === "high");
  return {
    byDong, gaps, candidates, strong, robust,
    byChance: Math.round(pairs * 0.0228),   // a bell curve puts 2.3% at −2 or below, shortage or not (D61, D66)
    gapDongs: [...byDong.values()].filter((summary) => summary.gaps.length).length,
    candidateDongs: new Set(candidates.map(({ dong }) => dong.code)).size,
    strongDongs: new Set(strong.map(({ dong }) => dong.code)).size,
  };
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} (${response.status})`);
  return response.json();
}

function showError(message) {
  const box = document.getElementById("error");
  box.textContent = message;
  box.hidden = false;
}

async function createMap() {
  // The map draws Korean labels with the page font, once: wait (briefly) until it has loaded, or they stay in the fallback
  await Promise.race([document.fonts.load(`16px ${KOREAN_FONT}`), new Promise((resolve) => setTimeout(resolve, 1500))]);
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  const [west, south, east, north] = SEOUL_BOUNDS;
  state.map = new maplibregl.Map({
    container: "map",
    style: baseStyle(getLanguage(), `pmtiles://${new URL(BASEMAP, location.href).href}`),
    bounds: [[west, south], [east, north]], maxBounds: PAN_LIMITS, minZoom: 9, maxZoom: 19,
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
    attributionControl: { compact: true },
    localIdeographFontFamily: KOREAN_FONT,      // Korean labels are drawn with the page font
  });
  state.map.touchZoomRotate.disableRotation();
  state.map.keyboard.disableRotation();
  state.map.addControl(new maplibregl.ScaleControl({ maxWidth: 96 }), "bottom-right");   // the atlas's scale bar (D75)
  state.map.on("error", (event) => console.warn("map:", event.error?.message ?? event));
  state.map.on("styleimagemissing", ({ id }) => {   // the water's hatch (also after a language switch rebuilds the style)
    if (id === WATER_HATCH && !state.map.hasImage(id)) state.map.addImage(id, waterHatchImage(), { pixelRatio: 2 });
  });
  return new Promise((resolve) => state.map.once("load", resolve));
}

function bindMapEvents() {
  const map = state.map;
  map.on("move", positionCard);
  map.on("zoom", () => {
    const band = zoomBand();
    if (band === state.zoomBand) return;
    const down = band < state.zoomBand;
    state.zoomBand = band;
    renderDotControls();
    renderLayerControl();
    if (down) closeCard();
  });
  map.on("moveend", refreshDots);
  map.on("moveend", declutterPins);   // after a zoom or a pan: overlaps and pins by the panel's edge change
  map.on("mousemove", handlePointerMove);
  map.getCanvas().addEventListener("mouseleave", () => { setHovered(null); document.getElementById("tooltip").hidden = true; });
  map.on("click", handleClick);
}

// Space taken by the floating cards, so the map fits Seoul or a neighborhood into the free area
function mapPadding() {
  const wide = window.innerWidth > NARROW_WIDTH;
  const card = document.getElementById("top-card").getBoundingClientRect();
  const sheet = document.getElementById("sheet").getBoundingClientRect();
  const padding = wide ? { top: 40, right: sheet.width + 40, bottom: 80, left: card.width + 40 }
                       : { top: card.height + 24, right: 24, bottom: phoneSheetRestHeight() + 24, left: 24 };
  // Never leave less than 120 px of map: MapLibre refuses to fit into nothing
  const { clientWidth: width, clientHeight: height } = state.map.getContainer();
  const shrink = (a, b, size) => Math.min(1, (size - 120) / (padding[a] + padding[b]));
  const vertical = shrink("top", "bottom", height), horizontal = shrink("left", "right", width);
  return { top: padding.top * vertical, bottom: padding.bottom * vertical, left: padding.left * horizontal, right: padding.right * horizontal };
}

// The phone sheet's height once it settles at its stop: it slides between stops, so measuring it mid-slide
// would fit the map to the wrong strip. The stops match --sheet-stop in style.css; the full stop counts as half.
const PEEK_HEIGHT = 132, HALF_SHARE = 0.42;
function phoneSheetRestHeight() {
  const sheet = document.getElementById("sheet");
  const peek = sheet.classList.contains("peek") && !sheet.classList.contains("expanded");
  return Math.min(sheet.scrollHeight, peek ? PEEK_HEIGHT : window.innerHeight * HALF_SHARE);
}

// Moves a point to the middle of the area the cards leave free (an offset does not change the map's padding)
function freeAreaOffset() {
  const padding = mapPadding();
  return [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2];
}

function fitBounds([west, south, east, north], { maxZoom = 19, animate = true } = {}) {
  state.map.fitBounds([[west, south], [east, north]], { padding: mapPadding(), maxZoom, animate, duration: animate ? 700 : 0 });
}

function fitSeoul({ animate = true } = {}) {
  fitBounds(SEOUL_BOUNDS, { animate });
}

// ---------------------------------------------------------------------------
// Neighborhood shapes and names
// ---------------------------------------------------------------------------
function drawNeighborhoods() {
  const map = state.map;
  const features = state.data.dongs.map((dong, index) => {
    state.dongIndex.set(dong.code, index);
    const points = dong.polygons.flat(2);
    const lats = points.map((p) => p[0]), lngs = points.map((p) => p[1]);
    state.bboxes.set(dong.code, [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]);
    const coordinates = dong.polygons.map((rings) => rings.map((ring) => ring.map(([lat, lng]) => [lng, lat])));
    return { type: "Feature", id: index, properties: { code: dong.code }, geometry: { type: "MultiPolygon", coordinates } };
  });
  map.addSource("dongs", { type: "geojson", data: { type: "FeatureCollection", features } });

  // Everything outside Seoul is faded, so the city stands out (a large box with Seoul cut out of it)
  const [[west, south], [east, north]] = MAP_LIMITS;
  const box = [[west - 1, south - 1], [east + 1, south - 1], [east + 1, north + 1], [west - 1, north + 1], [west - 1, south - 1]];
  const seoulRings = state.data.seoul_outline.map(([outer]) => outer.map(([lat, lng]) => [lng, lat]));
  map.addSource("outside-seoul", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [box, ...seoulRings] } } });
  // The ink atlas (D75): the land outside Seoul fades into the ground, the city edge is a firm ink line
  // drawn see-through over white land, it shows exactly as the ground (round 4 measured #F6F7F5)
  map.addLayer({ id: "outside-seoul", type: "fill", source: "outside-seoul",
    paint: { "fill-color": underWhite(COLORS.ground, 0.8), "fill-opacity": 0.8 } }, OUTLINE_BEFORE);
  map.addLayer({ id: "seoul-border", type: "line", source: "outside-seoul",
    paint: { "line-color": COLORS.ink, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.2, 14, 2.2] } }, OUTLINE_BEFORE);

  // Suggested neighborhoods (and wishlist matches) get a pink outline; the selected one a dark ink outline
  const highlighted = ["boolean", ["feature-state", "highlighted"], false];
  // Close in, the tint thins (half by zoom 14, under a third at street level), so the streets and buildings stay readable
  const tint = ["coalesce", ["feature-state", "opacity"], 0];
  map.addLayer({ id: "dong-fill", type: "fill", source: "dongs",
    paint: { "fill-color": ["coalesce", ["feature-state", "color"], "#000000"],
             // D80: thins less than before (was half by 14), so the colours still tell areas apart close in
             "fill-opacity": ["interpolate", ["linear"], ["zoom"], 12, tint, 14, ["*", 0.75, tint], 16, ["*", 0.3, tint]] } },
  TINT_BEFORE);
  map.addLayer({ id: "dong-line", type: "line", source: "dongs",
    paint: { "line-color": ["case", highlighted, COLORS.brand, COLORS.ink], "line-opacity": ["case", highlighted, 0.9, 0.3],
             "line-width": ["interpolate", ["linear"], ["zoom"], 10, ["case", highlighted, 1.4, 0.5], 14, ["case", highlighted, 2.2, 1]] } },
  OUTLINE_BEFORE);
  // The 25 구 borders (scripts/build_gu_borders.py), a darker ink line between the faint neighborhood lines
  map.addSource("gu-borders", { type: "geojson", data: state.guBorders });
  map.addLayer({ id: "gu-borders", type: "line", source: "gu-borders",
    paint: { "line-color": COLORS.ink, "line-opacity": 0.6, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 1.8] } },
  OUTLINE_BEFORE);
  map.addLayer({ id: "dong-hover", type: "line", source: "dongs", filter: ["==", ["id"], -1],
    paint: { "line-color": COLORS.ink, "line-opacity": 0.6, "line-width": 2 } }, OUTLINE_BEFORE);
  map.addLayer({ id: "dong-selected", type: "line", source: "dongs", filter: ["==", ["id"], -1],
    paint: { "line-color": COLORS.ink, "line-width": 2.8 } }, OUTLINE_BEFORE);

  // Our own place names: the 25 구 when zoomed out, our 424 neighborhoods closer in (the base map's own place names
  // follow legal dongs, which differ from the 행정동 the data is about)
  const guPoints = new Map();
  const guNamesEn = new Map();
  for (const dong of state.data.dongs) {
    if (!guPoints.has(dong.gu)) guPoints.set(dong.gu, []);
    guPoints.get(dong.gu).push(dong.center);
    guNamesEn.set(dong.gu, dong.gu_en);
  }
  const point = ([lat, lng], properties) => ({ type: "Feature", properties, geometry: { type: "Point", coordinates: [lng, lat] } });
  const average = (centers) => [0, 1].map((i) => centers.reduce((sum, c) => sum + c[i], 0) / centers.length);
  // kept for hideCoveredGuNames: where each gu name sits
  state.guLabels = [...guPoints].map(([gu, centers]) => {
    const [lat, lng] = average(centers);
    return { name: gu, name_en: guNamesEn.get(gu), lngLat: [lng, lat] };
  });
  const labels = [
    ...[...guPoints].map(([gu, centers]) => point(average(centers), { kind: "gu", name: gu, name_en: guNamesEn.get(gu) })),
    ...state.data.dongs.map((dong) => point(dong.center,
      { kind: "dong", name: dong.dong.split(" ")[1], name_en: dong.dong_en, code: dong.code })),
  ];
  map.addSource("place-names", { type: "geojson", data: { type: "FeatureCollection", features: labels } });
  map.addLayer({ id: "gu-names", type: "symbol", source: "place-names", maxzoom: 11.5, filter: ["==", ["get", "kind"], "gu"],
    layout: { "text-field": placeLabelField(), "text-font": ["Noto Sans Medium"], "text-letter-spacing": 0.18,
              "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 11, 14] },   // spaced like a printed atlas (D75)
    paint: { "text-color": "#4b4e52", "text-halo-color": "#ffffff", "text-halo-width": 1.8 } });
  map.addLayer({ id: "dong-names", type: "symbol", source: "place-names", minzoom: 11.5, maxzoom: 16, filter: dongNameFilter(),
    layout: { "text-field": placeLabelField(), "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 15, 13.5] },
    paint: { "text-color": "#4b4e52", "text-halo-color": "#ffffff", "text-halo-width": 1.6 } });
}

// Our gu and dong labels in the current language (each label carries both names)
function placeLabelField() {
  return ["get", getLanguage() === "en" ? "name_en" : "name"];
}

// Neighborhoods with a name pin, so their plain label is left out
function dongNameFilter() {
  const pinned = pinnedDongs().map(({ dong }) => dong.code);
  return ["all", ["==", ["get", "kind"], "dong"], ["!", ["in", ["get", "code"], ["literal", pinned]]]];
}

function isCandidate(dong) {
  return Boolean(state.trade) && dong.trade_candidates.some((c) => c.trade === state.trade);
}

// Pink outline: wishlist matches while the wishlist is open, else the suggestions of the chosen trade (or of all trades)
function isHighlighted(dong) {
  if (state.wishlist) return state.wishMatches.has(dong.code);
  if (state.trade) return isCandidate(dong);
  return state.layer === "suggested" && Boolean(state.overview.byDong.get(dong.code)?.suggested.length);
}

function styleDong(dong) {
  state.map.setFeatureState({ source: "dongs", id: state.dongIndex.get(dong.code) }, { ...tintOf(dong), highlighted: isHighlighted(dong) });
}

function tintOf(dong) {
  if (state.wishlist) return state.wishMatches.has(dong.code) ? SUGGESTED_STYLE.one : NO_TINT;
  if (state.layer === "suggested") return suggestedTint(dong);
  const layer = LAYERS[state.layer];
  const value = layer.value ? layer.value(dong) : null;
  if (value === null) return NO_TINT;
  if (layer.diverging) {
    const { color, opacity } = gapStyle(simulatedGap(dong) ?? value);
    return { color, opacity };
  }
  return { color: layer.color, opacity: OPACITY_STEPS[quantileClass(value, state.breaks)] };
}

// Opening view: a light pink where a trade has a gap, stronger where gaps passed the checks (suggested)
function suggestedTint(dong) {
  const summary = state.overview.byDong.get(dong.code);
  if (!summary) return NO_TINT;
  if (!summary.suggested.length) return SUGGESTED_STYLE.gapOnly;
  return summary.suggested.length > 1 ? SUGGESTED_STYLE.several : SUGGESTED_STYLE.one;
}

// While simulating, the simulated neighborhood shows its gap score with the new shop ("연 뒤") or without it
function simulatedGap(dong) {
  const gap = state.sim?.result?.competition.gap;
  if (!gap || state.sim.dong !== dong) return null;
  return state.sim.showAfter ? gap.after : gap.before;
}

function restyleAll() {
  const layer = LAYERS[state.layer];
  state.breaks = layer.value && !layer.diverging ? layerBreaks(layer) : null;
  for (const dong of state.data.dongs) styleDong(dong);
}

function showOutline(layerId, dong) {
  state.map.setFilter(layerId, ["==", ["id"], dong ? state.dongIndex.get(dong.code) : -1]);
}

// Quantile limits. The hourly crowd uses all hours together, so colors can be compared across the day.
function layerBreaks(layer) {
  let values;
  if (layer.timed) {
    values = state.data.dongs.flatMap((dong) => [...dong.hourly.weekday, ...dong.hourly.weekend]);
  } else {
    values = state.data.dongs.map(layer.value).filter((v) => v !== null);
  }
  values.sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((share) => values[Math.floor(share * (values.length - 1))]);
}

function quantileClass(value, breaks) {
  const position = breaks.findIndex((limit) => value <= limit);
  return position === -1 ? breaks.length : position;
}

// Name pins: the suggested neighborhoods of the chosen trade, or (opening view) those with a strongest lead (★).
// The most important come first: they win when pins overlap (declutterPins).
function pinnedDongs() {
  if (state.wishlist || state.sim) return [];
  if (state.trade) {
    return rankedCandidates().map(({ dong, candidate }) => ({ dong, strong: candidate.sales_per_shop === "high" }));
  }
  if (state.layer !== "suggested") return [];
  return strongDongsInOrder().map((dong) => ({ dong, strong: true }));
}

// At home, the ★ areas by their biggest gap among the trades that sell well: the order of the pins and of the lead list
function strongDongsInOrder() {
  const biggestStrongGap = (dong) => Math.max(...dong.trade_candidates
    .filter((c) => c.sales_per_shop === "high").map((c) => c.expected - c.actual));
  return state.data.dongs
    .filter((dong) => dong.trade_candidates.some((c) => c.sales_per_shop === "high"))
    .sort((a, b) => biggestStrongGap(b) - biggestStrongGap(a));
}

function candidateOf(dong) {
  return dong.trade_candidates.find((c) => c.trade === state.trade);
}

// The chosen trade's suggested neighborhoods in one order for the list and the numbered pins:
// those whose shops already sell well (★) first, then the biggest gap first
function rankedCandidates() {
  return state.data.dongs.filter(isCandidate).map((dong) => ({ dong, candidate: candidateOf(dong) }))
    .sort((a, b) => (b.candidate.sales_per_shop === "high") - (a.candidate.sales_per_shop === "high")
                    || a.dong.trades[state.trade].resid - b.dong.trades[state.trade].resid);
}

// "07": ranks and counts in two digits, like the numbered stops of a printed map
function pinRank(n) {
  return String(n).padStart(2, "0");
}

// A pin: the pink dot sits on the neighborhood's centre, the rank and the name to its right (D75)
function drawPins() {
  for (const pin of state.pins) pin.remove();
  state.pins = [];
  state.map.setFilter("dong-names", dongNameFilter());
  pinnedDongs().forEach(({ dong, strong }, index) => {
    const button = document.createElement("button");
    button.className = `pin${strong ? " strong" : ""}`;
    button.type = "button";
    // D80: the pin carries only its number and name; "−25곳" on the map was hard to read, so the shop counts
    // live in the list and the report, said in words ("12곳 · 사람 수로 보면 보통 37곳")
    button.innerHTML = `<span class="pin-dot" aria-hidden="true"></span><span class="pin-rank">${pinRank(index + 1)}</span>`
      + `<span class="pin-name">${escapeHtml(placeName(dong))}${strong ? '<span class="pin-star" aria-hidden="true">★</span>' : ""}</span>`;
    button.addEventListener("click", (event) => { event.stopPropagation(); selectDong(dong, { zoom: true }); });
    const holder = document.createElement("div");
    holder.appendChild(button);
    const pin = new maplibregl.Marker({ element: holder, anchor: "left", offset: [-8, 0] })
      .setLngLat([dong.center[1], dong.center[0]]).addTo(state.map);
    state.pins.push(pin);
  });
  showPins();
}

function showPins() {
  for (const pin of state.pins) pin.getElement().style.display = state.dots.active ? "none" : "";   // overview only
  declutterPins();
}

// A pin whose name would run under the docked panel reads leftwards instead (style.css .pin.flip)
function flipPins() {
  const panel = document.getElementById("panel").getBoundingClientRect();
  const folded = document.querySelector(".app").classList.contains("panel-folded");
  const edge = window.innerWidth > NARROW_WIDTH && !folded && panel.width ? panel.left : window.innerWidth;
  for (const pin of state.pins) {
    const button = pin.getElement().firstChild;
    button.classList.remove("flip");
    if (button.getBoundingClientRect().right > edge - 8) button.classList.add("flip");
  }
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// A pin that would cover a more important one first drops its name box (the name stays for screen readers; style.css
// .pin.compact), then tries its rank on the dot's other side, above the dot and below it. A rank is never hidden
// (round 5: hidden ranks left gaps in the numbering): a dot on almost the same spot as a placed one adds its rank to that
// pin's ("05·06"); otherwise it keeps its last try, drawn under the higher ranks. A pin whose dot sits under the left
// column or the panel, or off the screen, is not drawn (rounds 5 and 6: a name peeked out beside them).
function declutterPins() {
  flipPins();
  const covered = coveredAreas();
  const placed = [];
  state.pins.forEach((pin, index) => {
    const element = pin.getElement();
    if (element.style.display === "none") return;
    element.style.zIndex = String(state.pins.length - index);
    const button = element.firstChild;
    button.classList.remove("compact", "above", "below", "merged");
    button.querySelector(".pin-also")?.remove();
    const dot = button.querySelector(".pin-dot").getBoundingClientRect();
    const middle = { left: dot.left + dot.width / 2, top: dot.top + dot.height / 2 };
    const offScreen = middle.left < 0 || middle.left > window.innerWidth || middle.top < 0 || middle.top > window.innerHeight;
    const underUi = offScreen || covered.some((area) => overlaps({ ...middle, right: middle.left, bottom: middle.top }, area));
    element.style.visibility = underUi ? "hidden" : "";
    if (underUi) return;
    const tries = [
      () => {},
      () => button.classList.add("compact"),
      () => button.classList.toggle("flip"),
      () => { button.classList.remove("flip"); button.classList.add("above"); },
      () => button.classList.replace("above", "below"),
    ];
    // only the rank and name can move: a dot touching a placed pin's dot would otherwise rule out every try
    let free = false;
    for (const step of tries) {
      step();
      const label = pinBox(button, { withDot: false });
      free = !placed.some((other) => overlaps(label, other.box));
      if (free) break;
    }
    // two dots on almost one spot (neighbouring areas at the city view): the earlier pin's rank reads "05·06"
    const twin = free ? null : placed.find((other) => Math.hypot(other.middle.left - middle.left, other.middle.top - middle.top) < SHARED_RANK_PX);
    if (twin) {
      button.classList.remove("above", "below");
      button.classList.add("merged");
      twin.rank.insertAdjacentHTML("beforeend", `<span class="pin-also" aria-hidden="true">·${pinRank(index + 1)}</span>`);
    }
    placed.push({ box: pinBox(button), middle, rank: button.querySelector(".pin-rank") });
  });
  hideCoveredGuNames(placed.map((pin) => pin.box));
}

// The screen boxes over the map: the left column's cards and the docked panel
function coveredAreas() {
  return [...document.querySelectorAll(".left-column > *, #panel")]
    .map((element) => element.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0);
}

// What a pin draws: its dot (unless left out), its rank and (unless compact) its name box
function pinBox(button, { withDot = true } = {}) {
  const compact = button.classList.contains("compact");
  const boxes = [...button.children]
    .filter((part) => !(compact && part.classList.contains("pin-name")) && (withDot || !part.classList.contains("pin-dot")))
    .map((part) => part.getBoundingClientRect());
  return { left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)),
           top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)) };
}

// A gu name a pin would cover is left out, so the pins read first at the city view (round 2: pins sat on the names).
// The name's box is estimated from its letters: the gu-names text size (11 px at zoom 9 to 14 px at zoom 11),
// Korean letters about 1 em wide and English ones about 0.6 em, plus the 0.18 em letter spacing.
function hideCoveredGuNames(pinBoxes) {
  const map = state.map, english = getLanguage() === "en";
  if (!state.guLabels || !map.getLayer("gu-names")) return;   // pins can be drawn before the labels are added
  const origin = map.getContainer().getBoundingClientRect();
  const size = Math.min(14, Math.max(11, 11 + (map.getZoom() - 9) * 1.5));
  const covered = state.guLabels.filter((label) => {
    const at = map.project(label.lngLat);
    const text = english ? label.name_en : label.name;
    const halfWidth = (text.length * size * ((english ? 0.6 : 1) + 0.18)) / 2 + 2, halfHeight = size * 0.7;
    const box = { left: origin.left + at.x - halfWidth, right: origin.left + at.x + halfWidth,
                  top: origin.top + at.y - halfHeight, bottom: origin.top + at.y + halfHeight };
    return pinBoxes.some((pin) => overlaps(box, pin));
  }).map((label) => label.name);
  map.setFilter("gu-names", ["all", ["==", ["get", "kind"], "gu"], ["!", ["in", ["get", "name"], ["literal", covered]]]]);
}

// ---------------------------------------------------------------------------
// Pointer: hover and click on neighborhoods and store dots
// ---------------------------------------------------------------------------
function dongAt(point) {
  const feature = state.map.queryRenderedFeatures(point, { layers: ["dong-fill"] })[0];
  return feature ? state.data.dongs[feature.id] : null;
}

// How close the map is: 0 Seoul and 구 level, 1 neighbourhood level (shop markers), 2 street level (gray dots too)
function zoomBand() {
  const zoom = state.map.getZoom();
  if (zoom >= DOTS_MIN_ZOOM) return 2;
  return zoom >= LABELS_MIN_ZOOM ? 1 : 0;
}

// The store dot or shop marker closest to the pointer, within a few pixels (small dots are hard to hit exactly)
function storeDotAt(point) {
  if (!state.dots.streetLevel) return null;
  const box = [[point.x - HIT_RADIUS, point.y - HIT_RADIUS], [point.x + HIT_RADIUS, point.y + HIT_RADIUS]];
  let best = null, bestDistance = Infinity;
  for (const feature of state.map.queryRenderedFeatures(box, { layers: ["store-icons", "shop-labels", "shop-outside"] })) {
    const at = state.map.project(feature.geometry.coordinates);
    const y = at.y + (feature.properties.shift ?? 0);   // a stacked marker is drawn this far below its building's point
    const distance = (at.x - point.x) ** 2 + (y - point.y) ** 2;
    if (distance < bestDistance) {
      best = feature;
      bestDistance = distance;
    }
  }
  return best;
}

function setHovered(dong) {
  if (state.hovered === dong) return;
  state.hovered = dong;
  showOutline("dong-hover", dong);
}

function handlePointerMove(event) {
  const tooltip = document.getElementById("tooltip");
  const dot = storeDotAt(event.point);
  const dong = dongAt(event.point);
  setHovered(dong);
  state.map.getCanvas().style.cursor = dot || dong ? "pointer" : "";
  if (!dot && !dong) {
    tooltip.hidden = true;
    return;
  }
  if (dot) {
    const building = state.dots.buildingAt(dot.properties.building);
    const shown = building.stores.filter((s) => s.visible);
    tooltip.textContent = shown.length === 1 ? shown[0].name : `${building.name || building.address} · ${t("buildingStores", shown.length)}`;
  } else {
    tooltip.textContent = dongTooltip(dong);
  }
  tooltip.style.transform = `translate(${event.point.x + 14}px, ${event.point.y + 14}px)`;
  tooltip.hidden = false;
}

function dongTooltip(dong) {
  if (state.layer === "suggested" && !state.wishlist) {
    const summary = state.overview.byDong.get(dong.code);
    const place = fullPlaceName(dong);
    if (!summary) return place;
    const names = (list) => list.map(tradeName).join(", ");
    const suggested = summary.suggested.map((c) => `${tradeName(c.trade)}${c.sales_per_shop === "high" ? "★" : ""}`).join(", ");
    return summary.suggested.length ? `${place} · ${t("tooltipSuggested", suggested)}` : `${place} · ${t("tooltipGaps", names(summary.gaps))}`;
  }
  const layer = LAYERS[state.layer];
  const value = layer.value ? layer.value(dong) : null;
  return value === null || !layer.value ? fullPlaceName(dong) : `${fullPlaceName(dong)} · ${layerValueText(value)}`;
}

function handleClick(event) {
  document.getElementById("tooltip").hidden = true;      // the click answers it: the card or the report opens
  if (state.sim) {
    moveSimulation(event.lngLat.lng, event.lngLat.lat);
    return;
  }
  const dot = storeDotAt(event.point);
  if (dot) {
    openCard(state.dots.buildingAt(dot.properties.building));
    return;
  }
  closeCard();
  const dong = dongAt(event.point);
  if (dong && dong === state.selected) clearSelection();   // a second tap on the chosen area lets it go; the map stays (D83)
  else if (dong) selectDong(dong, { zoom: false });
}

// ---------------------------------------------------------------------------
// Building card: every store in the building, by floor
// ---------------------------------------------------------------------------
function addBuildingHighlight() {
  state.map.addSource("building-highlight", { type: "geojson", data: EMPTY });
  state.map.addLayer({ id: "building-highlight-fill", type: "fill", source: "building-highlight",
    paint: { "fill-color": COLORS.ink, "fill-opacity": 0.1 } }, OUTLINE_BEFORE);
  state.map.addLayer({ id: "building-highlight-line", type: "line", source: "building-highlight",
    paint: { "line-color": COLORS.ink, "line-width": 1.6 } }, OUTLINE_BEFORE);
}

// The OpenStreetMap building outline under the store position, if the base map has one there
function highlightBuilding(building) {
  const at = state.map.project([building.lng, building.lat]);
  const near = state.map.queryRenderedFeatures([[at.x - 6, at.y - 6], [at.x + 6, at.y + 6]], { layers: ["buildings"] });
  const footprint = near.find((feature) => containsPoint(feature.geometry, building.lng, building.lat)) ?? near[0];
  state.map.getSource("building-highlight").setData(footprint ? { type: "Feature", properties: {}, geometry: footprint.geometry } : EMPTY);
}

function openCard(building) {
  state.card = building;
  state.dots.select(building);
  highlightBuilding(building);
  const card = document.getElementById("store-card");
  card.innerHTML = buildingCardHtml(building);
  card.querySelector(".store-close").addEventListener("click", closeCard);
  card.querySelector("#simulate-building")?.addEventListener("click", () => startSimulation(building.lng, building.lat));
  card.hidden = false;
  card.querySelector(".floor-list").scrollTop = 0;
  positionCard();
}

function buildingCardHtml(building) {
  const stores = building.stores;
  const hidden = stores.filter((s) => !s.visible).length;
  const competitors = state.trade ? stores.filter((s) => s.competitor).length : 0;
  const kinds = countBy(stores.map((s) => s.group)).map(([group, n]) =>
    `<span class="kind">${escapeHtml(groupName(state.meta.groups[group]))} ${n}</span>`);
  const floors = [...countBy(stores.map((s) => s.floor)).map(([floor]) => floor)].sort(floorOrder).map((floor) => {
    const here = stores.filter((s) => s.floor === floor).sort((a, b) => (b.competitor - a.competitor) || a.group - b.group);
    // a plain store's dot has its type's map colour (D80); competitors and extra kinds keep their own marks
    const dotStyle = (s) => (s.competitor || s.extra ? "" : ` style="background:${GROUP_COLORS[state.meta.groups[s.group].key]}"`);
    const items = here.map((s) => `<li class="${s.competitor ? "competitor" : ""}${s.extra ? " extra" : ""}${s.visible ? "" : " faded"}">
        <span class="dot"${dotStyle(s)}></span><span class="store-line"><b>${escapeHtml(s.name)}</b> <span>${escapeHtml(s.subtype)}</span></span></li>`);
    return `<li><p class="floor-label">${escapeHtml(floorLabel(floor))}</p><ul class="floor-stores">${items.join("")}</ul></li>`;
  });
  const label = building.name || building.address;
  const kakao = `https://map.kakao.com/link/map/${encodeURIComponent(label)},${building.lat},${building.lng}`;
  const roadview = `https://map.kakao.com/link/roadview/${building.lat},${building.lng}`;
  const simulate = state.trade
    ? `<button type="button" class="primary-button small" id="simulate-building">${t("simulateBuilding", tradeName(state.trade))}</button>` : "";
  return `
    <button class="icon-button store-close" type="button" aria-label="${t("close")}">×</button>
    <p class="store-name">${escapeHtml(label)}</p>
    ${building.name ? `<p class="store-meta">${escapeHtml(building.address)}</p>` : ""}
    <p class="building-count">${t("buildingStores", stores.length)}${hidden ? ` <span>· ${t("hiddenStores", hidden)}</span>` : ""}
      ${competitors ? `<span class="status status-risk"><span aria-hidden="true">!</span>${t("buildingCompetitors", tradeName(state.trade), competitors)}</span>` : ""}</p>
    <p class="kinds">${kinds.join("")}</p>
    <ul class="floor-list">${floors.join("")}</ul>
    ${simulate}
    <p class="card-links"><a href="${kakao}" target="_blank" rel="noopener">${t("kakaoMap")} ↗</a><a href="${roadview}" target="_blank" rel="noopener">${t("roadview")} ↗</a></p>`;
}

function floorLabel(floor) {
  return floor === -1 ? t("floorBasement") : floor === 0 ? t("floorUnknown") : t("floor", floor);
}

// Basement first, then 1층, 2층, ...; unknown floors last
function floorOrder(a, b) {
  const rank = (floor) => (floor === 0 ? 1000 : floor);
  return rank(a) - rank(b);
}

// Above the dot when there is room, otherwise below it; always inside the window, with the arrow on the dot
function positionCard() {
  if (!state.card) return;
  const card = document.getElementById("store-card");
  const at = state.map.project([state.card.lng, state.card.lat]);
  const width = state.map.getContainer().clientWidth;
  const gap = 14, margin = 8;
  const below = at.y - card.offsetHeight - gap < margin;
  const left = Math.min(Math.max(at.x - card.offsetWidth / 2, margin), width - card.offsetWidth - margin);
  const top = below ? at.y + gap : at.y - card.offsetHeight - gap;
  card.style.transform = `translate(${left}px, ${top}px)`;
  card.style.setProperty("--arrow-x", `${Math.min(Math.max(at.x - left, 16), card.offsetWidth - 16)}px`);
  card.classList.toggle("below", below);
}

function closeCard() {
  if (!state.card) return;
  state.card = null;
  state.dots.select(null);
  state.map.getSource("building-highlight").setData(EMPTY);
  document.getElementById("store-card").hidden = true;
}

// ---------------------------------------------------------------------------
// Store dots
// ---------------------------------------------------------------------------
async function refreshDots() {
  if (!state.dots.needsFiles) return;
  const bounds = state.map.getBounds();
  const codeOfGu = codeOfGuName();
  const guCodes = new Set();
  for (const dong of state.data.dongs) {
    const [w, s, e, n] = state.bboxes.get(dong.code);
    if (n >= bounds.getSouth() && s <= bounds.getNorth() && e >= bounds.getWest() && w <= bounds.getEast()) guCodes.add(codeOfGu[dong.gu]);
  }
  await state.dots.refresh([...guCodes]);
}

function codeOfGuName() {
  return Object.fromEntries(Object.entries(state.meta.files).map(([code, file]) => [file.gu, code]));
}

// The shop controls on the map: from zoom 14 the "같이 볼 가게" picker, from zoom 15 also the gray-dot group chips
function renderDotControls() {
  const active = state.dots.active;
  showPins();
  document.getElementById("zoom-hint").hidden = state.dots.streetLevel;
  const filters = document.getElementById("dot-filters");
  filters.hidden = !state.dots.streetLevel;
  if (filters.hidden) {
    noteFiltersHeight(filters);
    return;
  }
  let groupChips = "";
  if (active) {
    const chips = state.meta.groups.map((group, index) => {
      const on = state.dots.visibleGroups.has(index);
      // each chip shows its type's icon in its map colour, so the chips are also the key to the map (D80)
      return `<button type="button" class="chip group-chip${on ? " on" : ""}" data-group="${index}" aria-pressed="${on}">
        ${markerSvg("group", group.key)}${escapeHtml(groupName(group))}</button>`;
    });
    groupChips = `<div class="chip-row">${chips.join("")}</div>`;
  }
  filters.innerHTML = `${groupChips}${extraKindsHtml()}`;
  for (const chip of filters.querySelectorAll(".chip[data-group]")) {
    chip.addEventListener("click", () => {
      const groups = new Set(state.dots.visibleGroups);
      const index = Number(chip.dataset.group);
      if (groups.has(index)) groups.delete(index); else groups.add(index);
      state.dots.setVisibleGroups(groups);
      renderDotControls();
      if (state.card) openCard(state.dots.buildingByPosition(state.card));
    });
  }
  bindExtraKinds(filters);
  noteFiltersHeight(filters);
}

// Phones stack the map view card above the shop controls, whose height changes with what they hold
// Phones fit the map view card between the top card and the shop controls (style.css): note where the top card ends
function watchTopCard() {
  const app = document.querySelector(".app"), topCard = document.getElementById("top-card");
  new ResizeObserver(() => app.style.setProperty("--top-card-bottom", `${topCard.getBoundingClientRect().bottom}px`))
    .observe(topCard);
}

function noteFiltersHeight(filters) {
  const app = document.querySelector(".app");
  if (filters.hidden) app.style.removeProperty("--dot-filters-height");
  else app.style.setProperty("--dot-filters-height", `${filters.offsetHeight}px`);
}

// "같이 볼 가게": the picked kinds as chips (tap to remove) and a search box for up to 3
// The map's picker uses the prefix "extra"; the customer map's panel has its own, "similar"
function extraKindsHtml(prefix = "extra", title = t("extraTitle")) {
  const full = state.extraKinds.length >= MAX_EXTRA_KINDS;
  const chips = state.extraKinds.map((kind) => {
    const name = state.meta.subtypes[kind];
    return `<button type="button" class="chip on extra-chip" data-kind="${kind}" aria-label="${escapeHtml(t("removeKind", name))}">
      ${markerSvg("extra", kindIconKey(kind, state.meta))}<span>${escapeHtml(name)}</span><span class="remove" aria-hidden="true">×</span></button>`;
  });
  const placeholder = full ? t("extraFull") : t("extraPlaceholder");
  return `<div class="extra-kinds"><p class="extra-title">${title}</p><div class="extra-row">${chips.join("")}
    <div class="extra-search-box"><input type="search" id="${prefix}-search" autocomplete="off" aria-controls="${prefix}-results"
      aria-label="${escapeHtml(title)}" placeholder="${escapeHtml(placeholder)}"${full ? " disabled" : ""}>
    <div id="${prefix}-results" class="extra-results" role="listbox" hidden></div></div></div></div>`;
}

function bindExtraKinds(box, prefix = "extra") {
  for (const chip of box.querySelectorAll(".extra-chip")) {
    chip.addEventListener("click", () => {
      chooseExtraKinds(state.extraKinds.filter((kind) => kind !== Number(chip.dataset.kind)));
      focusExtraSearch(prefix);
    });
  }
  const input = box.querySelector(`#${prefix}-search`);
  input.addEventListener("input", () => renderExtraResults(input.value, prefix));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") document.querySelector(`#${prefix}-results button[data-kind]`)?.click();
    if (event.key === "Escape") {
      input.value = "";
      renderExtraResults("", prefix);
    }
  });
}

// Only the result list is redrawn while typing, so the search box keeps its focus
function renderExtraResults(query, prefix = "extra") {
  const list = document.getElementById(`${prefix}-results`);
  const exclude = new Set([...(state.trade ? state.meta.trade_subtypes[state.trade] : []), ...state.extraKinds]);
  const found = searchKinds(query, state.meta, exclude);
  list.hidden = !query.trim();
  list.innerHTML = found.length ? found.map((kind) => {
    const group = state.meta.groups[state.meta.subtype_groups[kind]];
    return `<button type="button" role="option" data-kind="${kind}">${markerSvg("extra", kindIconKey(kind, state.meta))}
      <span>${escapeHtml(state.meta.subtypes[kind])}</span><span class="extra-group">${escapeHtml(groupName(group))}</span></button>`;
  }).join("") : `<p class="extra-none">${t("extraNone")}</p>`;
  for (const button of list.querySelectorAll("button[data-kind]")) {
    button.addEventListener("click", () => {
      chooseExtraKinds([...state.extraKinds, Number(button.dataset.kind)]);
      focusExtraSearch(prefix);
    });
  }
}

function focusExtraSearch(prefix = "extra") {
  const input = document.getElementById(`${prefix}-search`);
  if (input && !input.disabled) input.focus();
}

// Shops only: the picked kinds change the map, the legend and the building card, never the analysis
function chooseExtraKinds(kinds) {
  state.extraKinds = kinds;
  state.dots.setExtraKinds(kinds);
  renderDotControls();
  renderLayerControl();
  refreshDots();
  if (state.customers) renderSheet({ keepScroll: true });   // the customer map counts the picked kinds per area
  writeLink();
}

// ---------------------------------------------------------------------------
// Choosing a trade, a neighborhood, a map view
// ---------------------------------------------------------------------------
// The key view comes with the choice: the trade's gaps, or (no trade) gaps and suggestions for all trades
function chooseTrade(trade, render = true) {
  state.customers = null;                         // any trade (or "바꾸기") leaves the customer map
  showPanel();
  if (state.sim) endSimulation(false);
  state.trade = trade;
  state.browsing = false;
  state.layer = trade ? "tradeGap" : "none";      // clearing the trade goes back to the plain map (D80)
  stopPlaying();
  if (state.wishlist && !trade) state.wishlist = state.wishlist.filter((key) => !CRITERIA.find((c) => c.key === key).needsTrade);
  if (state.wishlist) updateWishMatches();
  const own = new Set(trade ? state.meta.trade_subtypes[trade] : []);   // a picked kind of the new trade turns red
  state.extraKinds = state.extraKinds.filter((kind) => !own.has(kind));
  state.dots.extraSubtypes = state.extraKinds;
  state.dots.setMainTrade(trade);
  drawPins();
  closeCard();
  if (render) {
    state.selected = null;
    showOutline("dong-selected", null);
    renderAll();
    fitSeoul();
  }
  writeLink();
}

function selectDong(dong, { zoom }) {
  showPanel();                                    // first: fitBounds below measures the panel
  state.selected = dong;
  showOutline("dong-selected", dong);
  renderSheet();
  if (zoom) fitBounds(state.bboxes.get(dong.code), { maxZoom: CLOSEST_FIT_ZOOM });
  writeLink();
}

function clearSelection() {
  state.selected = null;
  showOutline("dong-selected", null);
  renderSheet();
  writeLink();
}

function setLayer(layer) {
  state.layer = layer;
  stopPlaying();
  restyleAll();
  drawPins();
  renderLayerControl();
  // at home the panel follows the map: the start view on the plain map, the overview on "all trades" (D80)
  if (!state.trade && !state.selected && !state.sim && !state.wishlist && !state.customers) renderSheet();
}

function stopPlaying() {
  clearInterval(state.playing);
  state.playing = null;
}

function togglePlay() {
  if (state.playing) {
    stopPlaying();
  } else {
    state.playing = setInterval(() => {
      state.hour = (state.hour + 1) % 24;
      restyleAll();
      renderLayerControl();
      if (state.selected) renderSheet();
    }, PLAY_STEP_MS);
  }
  renderLayerControl();
}

// ---------------------------------------------------------------------------
// Rendering: top card, sheet, map controls
// ---------------------------------------------------------------------------
function renderAll() {
  document.getElementById("language").textContent = getLanguage() === "ko" ? "EN" : "한국어";
  document.getElementById("help").setAttribute("aria-label", t("helpButton"));
  document.getElementById("help").innerHTML = `<span aria-hidden="true">?</span> ${t("helpShort")}`;   // a word, not only "?" (D80)
  document.getElementById("search").placeholder = t("searchPlaceholder");
  document.getElementById("zoom-in").setAttribute("aria-label", t("zoomIn"));
  document.getElementById("zoom-out").setAttribute("aria-label", t("zoomOut"));
  document.getElementById("seoul-all").textContent = t("seoulAll");
  document.getElementById("zoom-hint").textContent = t("zoomHint");
  document.getElementById("dots-loading").textContent = t("loadingStores");
  document.getElementById("sources").textContent = t("sources");
  document.querySelector(".brand").textContent = t("appName");
  document.getElementById("map").setAttribute("aria-label", t("mapLabel"));
  labelSheetHandle();
  document.getElementById("tagline").textContent = t("appTagline");
  renderPanelLabels();
  renderTradeStep();
  renderSheet();
  restyleAll();
  renderLayerControl();
  renderDotControls();
  renderCompareButton();
}

function renderTradeStep() {
  const box = document.getElementById("trade-step");
  const trades = Object.keys(state.meta.trade_subtypes);   // founder_trades.csv order: most common trades first
  if (state.trade) {
    const count = state.data.dongs.filter(isCandidate).length;
    box.innerHTML = `<div class="chosen">
        <p class="chosen-trade">${tradeIcon(state.trade)}${escapeHtml(tradeName(state.trade))}</p>
        <button type="button" class="text-button" id="change-trade">${t("change")}</button></div>
      <p class="map-count" aria-label="${escapeHtml(t("candidatesCount", count))}">
        <b aria-hidden="true">${pinRank(count)}</b><span aria-hidden="true">${t("mapCountLabel")}</span></p>`;
    box.querySelector("#change-trade").addEventListener("click", () => chooseTrade(""));
    return;
  }
  if (state.customers) {
    box.innerHTML = `<div class="chosen">
        <div><p class="chosen-trade">${t("customersTitle")}</p><p class="chosen-sub">${t("ownConcept")}</p></div>
        <button type="button" class="text-button" id="change-trade">${t("change")}</button></div>`;
    box.querySelector("#change-trade").addEventListener("click", () => chooseTrade(""));
    return;
  }
  if (state.browsing) {
    box.innerHTML = `<div class="chosen"><p class="chosen-sub">${t("browsing")}</p>
        <button type="button" class="text-button" id="pick-trade">${t("pickTrade")}</button></div>`;
    box.querySelector("#pick-trade").addEventListener("click", () => { state.browsing = false; renderTradeStep(); });
    return;
  }
  const chips = trades.map((trade) => `<button type="button" class="trade-chip" data-trade="${escapeHtml(trade)}">${tradeIcon(trade)}${escapeHtml(tradeName(trade))}</button>`);
  box.innerHTML = `<p class="question">${t("question")}</p><p class="question-hint">${t("questionHint")}</p>
    <div class="trade-grid">${chips.join("")}</div>
    <button type="button" class="text-button browse" id="just-browse">${t("justBrowse")}</button>
    <button type="button" class="text-button browse" id="own-concept">${t("ownConcept")}</button>`;
  for (const chip of box.querySelectorAll(".trade-chip")) chip.addEventListener("click", () => chooseTrade(chip.dataset.trade));
  box.querySelector("#just-browse").addEventListener("click", () => { state.browsing = true; renderTradeStep(); });
  box.querySelector("#own-concept").addEventListener("click", () => openCustomers());
}

// keepScroll: a choice in a form redraws the panel without jumping back to its top, and keeps the focus on its button
function renderSheet({ keepScroll = false } = {}) {
  const sheet = document.getElementById("sheet-body");
  sheet.classList.remove("early");
  sheet.removeAttribute("aria-busy");
  const focusedId = keepScroll && sheet.contains(document.activeElement) ? document.activeElement.id : "";
  if (state.sim) sheet.innerHTML = simulationView();
  else if (state.selected) sheet.innerHTML = state.customers ? customerDongView(state.selected) : dongView(state.selected);
  else if (state.customers) sheet.innerHTML = customersView();
  else if (state.wishlist) sheet.innerHTML = wishlistView();
  else if (state.trade) sheet.innerHTML = tradeView();
  else sheet.innerHTML = homeView();
  bindSheet();
  // Phones: the opening view and a simulation start at the peek, so the map (and the new shop's pin) stays in view;
  // every other answer opens at half height
  const view = state.sim ? "sim" : state.selected ? "dong" : state.customers ? "customers" : state.wishlist ? "wishlist"
    : state.trade ? "trade" : "home";
  if (view !== state.sheetView) {
    state.sheetView = view;
    if (sheetStop() !== 2) setSheetStop(view === "home" || view === "sim" ? 0 : 1);
  }
  if (!keepScroll) document.getElementById("sheet").scrollTop = 0;
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  updateSheetTall();
}

// When the panel reaches the bottom of the screen, the zoom buttons move left of it (a folded panel reaches nowhere)
function updateSheetTall() {
  const bottom = document.getElementById("sheet").getBoundingClientRect().bottom;
  document.querySelector(".app").classList.toggle("sheet-tall", bottom > window.innerHeight - 140);
}

// ----- Opening view: Seoul at a glance (gaps and suggestions for all trades) -----
// D80: the opening view chooses nothing. It says how to start in three steps; the overview of every trade's gaps
// is one tap away ("전체 업종 보기"), and shows when that map view is on.
function homeView() {
  return state.layer === "suggested" ? overviewView() : startView();
}

// The three steps of the app, shown at home and in the welcome, each with the piece of screen it talks about
function startStepsHtml() {
  const pictures = [
    `<span class="trade-chip step-sample" aria-hidden="true">${tradeIcon("카페")}${escapeHtml(tradeName("카페"))}</span>`,
    `<span class="pin step-sample" aria-hidden="true"><span class="pin-dot"></span><span class="pin-rank">01</span><span class="pin-name">${escapeHtml(t("startSamplePlace"))}</span></span>`,
    `<span class="kn step-sample" aria-hidden="true"><span class="kn-label">${escapeHtml(t("knShops", tradeName("카페")))}</span>`
      + `<span class="kn-value">${t("shopsNumber", 12)}</span><span class="kn-compare">${escapeHtml(t("knShopsCompare", 37))}</span></span>`,
  ];
  const steps = t("startSteps").map(([title, body], index) => `<li>
      <span class="step-number">${index + 1}</span>
      <div><p class="step-title">${title}</p><p class="step-body">${body}</p>${pictures[index]}</div></li>`);
  return `<ol class="steps start-steps">${steps.join("")}</ol>`;
}

function startView() {
  return `<h2 class="sheet-title">${t("startTitle")}</h2>
    <p class="sheet-lead">${t("startLead")}</p>
    ${startStepsHtml()}
    <div class="actions"><button type="button" class="primary-button" id="start-tour">${t("startTour")}</button></div>
    ${referenceNote()}
    <section class="box start-more">
      <h3 class="box-headline">${t("startMoreTitle")}</h3>
      <div class="start-links">
        <button type="button" class="secondary-button" id="show-overview">${t("startOverview")}</button>
        <button type="button" class="secondary-button" id="open-wishlist">${t("wishlistButton")}</button>
        <button type="button" class="secondary-button" data-open-customers>${t("ownConcept")}</button>
      </div>
    </section>`;
}

// Gaps of every trade at once (the old opening view, D54/D76), now behind a choice and with the method folded away
function overviewView() {
  const overview = state.overview;
  return `<div class="sheet-header"><button type="button" class="icon-button" id="hide-overview" aria-label="${t("back")}">‹</button>
      <div class="sheet-heading"><p class="eyebrow">${t("overviewTitle")}</p>
      <h2 class="sheet-title">${t("overviewHeadline", overview.candidateDongs)}</h2></div></div>
    ${referenceNote()}
    <p class="sheet-lead">${t("overviewIntro")}</p>
    <section class="box">
      <h3 class="box-headline">${t("tradeBarsTitle")}</h3>
      ${tradeBars()}
      <p class="fine-print">${t("tradeBarsNote")}</p>
    </section>
    <section class="box">
      <h3 class="box-headline">${t("leadsTitle")}</h3>
      ${leadList()}
    </section>
    <details class="more"><summary>${t("overviewMethod")}</summary>
      <p class="sentence small">${insightSentence()}</p>
      ${funnelChart(overview)}
      ${chartHint(t("hintFunnel", overview.gapDongs, overview.candidateDongs, overview.strongDongs))}
      <p class="fine-print">${t("funnelNote", overview.byChance)}</p>
      <p class="check-line">${t("funnelCheck", overview.gaps, overview.robust)}</p>
      <p class="fine-print">${t("homeInsightSource")}</p>
    </details>`;
}

// The finding the method rests on: in which trades fewer shops went with higher sales per shop
function insightSentence() {
  const roomTrades = state.data.trade_patterns.filter((p) => p.pattern === "room").map((p) => tradeName(p.trade));
  return t("homeInsight", Object.keys(state.meta.trade_subtypes).length, roomTrades);
}

// Gaps -> suggestions -> strongest leads, as three shrinking pink bars (one hue, darker = stronger)
function funnelChart(overview) {
  // counted in neighborhoods (곳), like the welcome and the map; the trade count (건) follows in the small line
  const rows = [
    { value: overview.gapDongs, label: t("funnelGaps", overview.gapDongs), sub: t("funnelGapsSub", overview.gaps), step: 1 },
    { value: overview.candidateDongs, label: t("funnelSuggested", overview.candidateDongs), sub: t("funnelSuggestedSub", overview.candidates.length), step: 2 },
    { value: overview.strongDongs, label: t("funnelStrong", overview.strongDongs), sub: t("funnelStrongSub", overview.strong.length), step: 3 },
  ];
  const items = rows.map((row) => `<li>
      <p class="funnel-label"><b>${row.label}</b> <span>${row.sub}</span></p>
      <div class="funnel-bar step-${row.step}" style="width:${Math.max(8, (row.value / overview.gapDongs) * 100)}%"></div></li>`);
  return `<ol class="funnel" aria-label="${t("funnelTitle")}">${items.join("")}</ol>`;
}

// Suggested neighborhoods per trade: one pink bar each (★ part darker), with what a gap means for the trade
function tradeBars() {
  const trades = Object.keys(state.meta.trade_subtypes);
  const counts = trades.map((trade) => {
    const here = state.overview.candidates.filter(({ candidate }) => candidate.trade === trade);
    return { trade, total: here.length, strong: here.filter(({ candidate }) => candidate.sales_per_shop === "high").length };
  });
  const most = Math.max(...counts.map((c) => c.total));
  const rows = counts.map(({ trade, total, strong }) => {
    const pattern = state.data.trade_patterns.find((p) => p.trade === trade).pattern;
    const width = (total / most) * 100, strongWidth = total ? (strong / total) * 100 : 0;
    return `<li><button type="button" class="trade-bar" data-trade="${escapeHtml(trade)}" title="${escapeHtml(t("tradeBarTitle", tradeName(trade), total, strong))}">
        <span class="trade-bar-name">${escapeHtml(tradeName(trade))}</span>
        <span class="trade-bar-track"><span class="trade-bar-fill" style="width:${width}%"><span class="trade-bar-strong" style="width:${strongWidth}%"></span></span>
          <span class="trade-bar-value">${total}${strong ? ` <span>★${strong}</span>` : ""}</span></span>
        ${statusChip(patternStatus(pattern), t("patternShort")[pattern])}
      </button></li>`;
  });
  const longest = counts.find((c) => c.total === most);   // the hint's example: the first longest bar
  return `<ul class="trade-bars">${rows.join("")}</ul>
    ${chartHint(t("hintTradeBars", tradeName(longest.trade), longest.total, longest.strong))}`;
}

function patternStatus(pattern) {
  return { room: "good", elsewhere: "risk", unclear: "neutral" }[pattern];
}

// The 18 strongest leads (gap + existing shops sell well), numbered by their area's pin on the map (round 5: the list
// counted trades, the map areas, so "04" named two places); an area's trades sit together, biggest gap first
function leadList() {
  const rank = new Map(strongDongsInOrder().map((dong, index) => [dong.code, index + 1]));
  const leads = state.overview.strong
    .map(({ dong, candidate }) => ({ dong, candidate, fewer: Math.max(1, Math.round(candidate.expected - candidate.actual)) }))
    .sort((a, b) => rank.get(a.dong.code) - rank.get(b.dong.code) || b.fewer - a.fewer);
  const shown = state.allLeads ? leads : leads.slice(0, LEADS_SHOWN);
  const items = shown.map(({ dong, candidate, fewer }) => {
    const ratio = dong.trades[candidate.trade].sales_per_shop / state.medians[candidate.trade].sales;
    return `<button type="button" class="place-card lead" data-rank="${pinRank(rank.get(dong.code))}" data-lead-trade="${escapeHtml(candidate.trade)}" data-code="${dong.code}">
      <span class="place-name"><span class="trade-tag">${escapeHtml(tradeName(candidate.trade))}</span>${escapeHtml(placeName(dong))} <span class="place-gu">${escapeHtml(guName(dong))}</span></span>
      <span class="place-line">${t("leadLine", fewer, ratio.toFixed(1))}</span>
      ${signalBadgeHtml(dong.trades[candidate.trade].signal)}</button>`;
  });
  const toggle = leads.length > LEADS_SHOWN
    ? `<button type="button" class="text-button" id="toggle-leads">${state.allLeads ? t("showFewerLeads") : t("showAllLeads", leads.length)}</button>` : "";
  return `<div class="place-list">${items.join("")}</div>${toggle}`;
}

// ---------------------------------------------------------------------------
// Reference-only notice (spec 5.5): the first-visit welcome, the ? help and the yellow note
// ---------------------------------------------------------------------------
const WELCOMED_KEY = "seoulScout.welcomed";

// Storage can be blocked (private mode, blocked site data): then the welcome simply shows on every visit
function readWelcomed() {
  try {
    return localStorage.getItem(WELCOMED_KEY) === "1";
  } catch {
    return false;
  }
}

function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    // nothing to remember it in
  }
}

function referenceNote() {
  return `<p class="reference-note">${t("referenceNote")}</p>`;
}

// D80 onboarding: the welcome is the app in three steps, each next to the piece of screen it means, and one choice:
// try it on the real screen (the tour) or start. The figures that used to lead it are in the overview.
function welcomeView() {
  return `<h2 class="sheet-title">${t("welcomeTitle")}</h2>
    <p class="welcome-lead">${t("welcomeLeadSimple")}</p>
    ${startStepsHtml()}
    ${referenceNote()}
    <p class="sentence quiet">${t("welcomeBody")}</p>
    <div class="actions"><button type="button" class="secondary-button" id="welcome-skip">${t("welcomeSkip")}</button>
      <button type="button" class="primary-button" id="welcome-start" autofocus>${t("welcomeStart")}</button></div>`;
}

function helpView() {
  const about = t("aboutPoints").map((point) => `<li>${point}</li>`).join("");
  const colors = t("colorKey").map(([role, word, meaning]) =>
    `<li><span class="color-swatch swatch-${role}"></span><b>${word}</b> ${meaning}</li>`);
  return `<h2 class="sheet-title">${t("helpButton")}</h2>
    <section class="section"><h2 class="section-title">${t("howToTitle")}</h2>${startStepsHtml()}</section>
    <div class="actions tour-replay-row"><button type="button" class="primary-button" id="tour-replay">${t("helpTour")}</button></div>
    <section class="section"><h2 class="section-title">${t("colorKeyTitle")}</h2><ul class="color-key">${colors.join("")}</ul></section>
    <section class="section"><h2 class="section-title">${t("aboutTitle")}</h2><ul class="about-points">${about}</ul>
      <p class="fine-print">${t("sources")}</p></section>`;
}

// kind "welcome" (first visit) or "help" (the ? button); closing the welcome in any way counts as seen
function openHelp(kind) {
  const dialog = document.getElementById("help-dialog");
  dialog.dataset.kind = kind;
  dialog.setAttribute("aria-label", kind === "welcome" ? t("welcomeTitle") : t("helpButton"));
  document.getElementById("help-body").innerHTML = kind === "welcome" ? welcomeView() : helpView();
  document.getElementById("welcome-start")?.addEventListener("click", beginTour);
  document.getElementById("welcome-skip")?.addEventListener("click", () => {
    endTour();
    dialog.close();
  });
  document.getElementById("tour-replay")?.addEventListener("click", () => {
    dialog.close();
    openHelp("welcome");
  });
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------------------------
// The tour (spec 5.7). The overlay is tour.js; here are the steps and the screen it leaves behind: however the
// tour ends (끝내기, ESC, ×, or 건너뛰기 after going back to the welcome), the screen is put back as it was.
// ---------------------------------------------------------------------------
const tour = { step: 0, saved: null };   // saved: the screen before the tour, while the tour runs

function viewSnapshot() {
  const customers = state.customers;
  return {
    trade: state.trade, browsing: state.browsing, layer: state.layer, selected: state.selected,
    customers: customers && { ...customers, who: [...customers.who], when: [...customers.when], narrow: [...customers.narrow] },
    wishlist: state.wishlist && [...state.wishlist], extraKinds: [...state.extraKinds],
    camera: { center: state.map.getCenter(), zoom: state.map.getZoom() },
    sheetStop: sheetStop(),
  };
}

async function restoreView(saved) {
  if (saved.customers) {
    await openCustomers(saved.customers);
    if (state.customers) state.customers.name = saved.customers.name;   // null when customers.json failed to load
  } else {
    chooseTrade(saved.trade, false);
  }
  state.extraKinds = [...saved.extraKinds];
  state.dots.setExtraKinds(state.extraKinds);
  state.browsing = saved.browsing;
  state.layer = saved.layer;
  state.wishlist = saved.wishlist;
  state.wishMatches = new Set();
  if (state.wishlist) updateWishMatches();
  state.selected = saved.selected;
  showOutline("dong-selected", saved.selected);
  drawPins();
  renderAll();
  setSheetStopAtOnce(saved.sheetStop);   // after the redraw, which picks the view's usual stop
  state.map.jumpTo(saved.camera);
  writeLink();
}

// Steps 2 and 3: Seoul at a glance
function showTourHome() {
  chooseTrade("", false);
  state.wishlist = null;
  state.wishMatches = new Set();
  state.selected = null;
  showOutline("dong-selected", null);
  renderAll();
  setSheetStopAtOnce(0);                 // the opening view's peek: on a small phone, half would hide the map's button
  fitSeoul({ animate: false });
}

// Step 3: the example trade chosen, so the map shows its numbered areas and the legend explains the colours (D80:
// the opening map is plain, so there would be nothing to read)
function showTourTrade() {
  chooseTrade(TOUR_TRADE, false);
  state.wishlist = null;
  state.wishMatches = new Set();
  state.selected = null;
  showOutline("dong-selected", null);
  renderAll();
  setSheetStopAtOnce(0);
  fitSeoul({ animate: false });
}

// Phones: the sheet has three heights, a peek, half (the default) and nearly full (D75). A tap on the grab bar goes
// one up (from full, back to half); a drag up or down goes one step that way.
const SHEET_STOPS = ["peek", "half", "expanded"];

function sheetStop() {
  const sheet = document.getElementById("sheet");
  return sheet.classList.contains("expanded") ? 2 : sheet.classList.contains("peek") ? 0 : 1;
}

function setSheetStop(index) {
  const sheet = document.getElementById("sheet");
  sheet.classList.toggle("peek", SHEET_STOPS[index] === "peek");
  sheet.classList.toggle("expanded", SHEET_STOPS[index] === "expanded");
  labelSheetHandle();
}

function labelSheetHandle() {
  const expanded = document.getElementById("sheet").classList.contains("expanded");
  document.getElementById("sheet-toggle").setAttribute("aria-label", t(expanded ? "sheetCollapse" : "sheetExpand"));
}

function bindSheetHandle() {
  const handle = document.getElementById("sheet-toggle");
  let startY = null, dragged = false;
  handle.addEventListener("pointerdown", (event) => { startY = event.clientY; dragged = false; });
  handle.addEventListener("pointerup", (event) => {
    if (startY === null) return;
    const moved = event.clientY - startY;
    startY = null;
    if (Math.abs(moved) < 12) return;   // a tap: the click below handles it
    dragged = true;
    setSheetStop(Math.min(2, Math.max(0, sheetStop() + (moved < 0 ? 1 : -1))));
  });
  handle.addEventListener("click", () => {
    if (dragged) { dragged = false; return; }
    setSheetStop(sheetStop() === 2 ? 1 : sheetStop() + 1);
  });
}

// The phone sheet at its new height at once, with no slide: what the tour scrolls to and lights must be measured
// where it ends up
function setSheetStopAtOnce(index) {
  const sheet = document.getElementById("sheet");
  sheet.style.transition = "none";
  setSheetStop(index);
  sheet.getBoundingClientRect();   // apply the new height before the slide comes back
  sheet.style.transition = "";
}

// Steps 4 and 5: the example's report (the phone sheet expanded for step 4), then the street around it
function showTourExample({ street = false } = {}) {
  const dong = tourDong();
  chooseTrade(TOUR_TRADE, false);
  state.wishlist = null;
  state.wishMatches = new Set();
  state.selected = dong;
  showOutline("dong-selected", dong);
  setSheetStopAtOnce(street ? 1 : 2);
  renderAll();
  // an offset, as the zoom-to-shops button does: a padding here would stay and stop the next fits from moving the map
  if (street) state.map.easeTo({ center: TOUR_SHOPS_CENTER, zoom: TOUR_STREET_ZOOM, offset: freeAreaOffset(), duration: 0 });
  else fitBounds(state.bboxes.get(dong.code), { maxZoom: CLOSEST_FIT_ZOOM, animate: false });
  // 열어보기 in the middle of the sheet: at its bottom edge, a phone's window would cut off the ring
  if (street) document.getElementById("simulate-dong")?.scrollIntoView({ block: "center" });
  else evidenceBox()?.scrollIntoView({ block: "nearest" });
}

function tourDong() {
  return state.data.dongs.find((dong) => dong.code === TOUR_DONG);
}

// Step 4 points at the report's key numbers (D80: they replaced the icon picture as the report's first screen)
function evidenceBox() {
  return document.querySelector("#sheet-body .key-numbers");
}

// What each step points at, measured again on every frame by tour.js
function tourTargets(step) {
  const rectOf = (element) => element?.getBoundingClientRect();
  if (step === 2) return [rectOf(document.getElementById("trade-step"))];
  if (step === 3) return [rectOf(document.getElementById("trade-step")), rectOf(document.getElementById("layer-control"))];
  if (step === 4) {
    // the docked panel ends at the window's edge: when a resize pushes the box past it, bring it back so its ring shows
    const box = evidenceBox(), rect = rectOf(box);
    if (rect && (rect.bottom > window.innerHeight || rect.top < 0)) box.scrollIntoView({ block: "nearest" });
    return [rectOf(box)];
  }
  const picker = rectOf(document.querySelector("#dot-filters .extra-kinds"));
  const simulate = rectOf(document.getElementById("simulate-dong"));
  // a phone has no free map between the cards for a third hole: the shop names show around the card
  if (window.innerWidth <= NARROW_WIDTH) return [picker, simulate];
  const point = state.map.project(TOUR_SHOPS_CENTER);
  const map = state.map.getContainer().getBoundingClientRect();
  const [width, height] = TOUR_MAP_BOX;
  return [new DOMRect(map.left + point.x - width / 2, map.top + point.y - height / 2, width, height), picker, simulate];
}

function tourCopy(step) {
  const place = placeName(tourDong()), trade = tradeName(TOUR_TRADE);
  return {
    2: [t("tourTradeTitle"), t("tourTradeBody")],
    3: [t("tourMapTitle"), t("tourMapBody")],
    4: [t("tourReportTitle"), t("tourReportBody", place, trade)],
    5: [t("tourShopsTitle"), t("tourShopsBody", trade)],
  }[step];
}

// The welcome's start button: remember the screen once (going back to the welcome and on keeps the first one)
function beginTour() {
  tour.saved ??= viewSnapshot();
  showLeftColumn();   // the tour points at the trade chips and the map view
  document.getElementById("help-dialog").close();
  goToTourStep(2);
}

function goToTourStep(step) {
  tour.step = step;
  document.getElementById("layer-control").classList.toggle("tour-legend", step === 3);   // phones fold the legend away
  if (step === 1) {
    closeTour();
    openHelp("welcome");
    return;
  }
  if (step === 2) showTourHome();
  else if (step === 3) showTourTrade();
  else showTourExample({ street: step === 5 });
  const [title, body] = tourCopy(step);
  showTourStep({
    step, total: TOUR_STEPS, title, body, targets: () => tourTargets(step),
    onBack: () => goToTourStep(step - 1),
    onNext: () => (step === TOUR_STEPS ? endTour() : goToTourStep(step + 1)),
    onClose: () => endTour(),
  });
}

// Every way out of the tour ends here. With nothing saved (the welcome closed on a first visit) it does nothing.
async function endTour() {
  closeTour();
  document.getElementById("layer-control").classList.remove("tour-legend");
  const saved = tour.saved;
  tour.saved = null;                 // first: a second call while this one waits must not restore twice
  tour.step = 0;
  if (saved) await restoreView(saved);
}

// A status shown everywhere the same way: icon + word (+ what it is about), never color alone
function statusChip(status, label) {
  const word = t("statusWords")[status];
  return `<span class="status status-${status}"><span class="status-icon" aria-hidden="true">${STATUS[status].icon}</span>${label ? escapeHtml(label) : word}</span>`;
}

function statusLine(status, text) {
  return `<span class="status-text status-text-${status}"><span aria-hidden="true">${STATUS[status].icon}</span> ${text}</span>`;
}

// ----- One trade: its suggested neighborhoods -----
function tradeView() {
  const pattern = state.data.trade_patterns.find((p) => p.trade === state.trade);
  const candidates = rankedCandidates();   // numbered like the pins (style.css counts the cards)
  const name = tradeName(state.trade);
  const cards = candidates.map(({ dong, candidate }) => `
    <button type="button" class="place-card" data-code="${dong.code}">
      <span class="place-name">${escapeHtml(placeName(dong))} <span class="place-gu">${escapeHtml(guName(dong))}</span></span>
      <span class="place-line">${t("candidateLine", name, candidate.actual, Math.round(candidate.expected))}</span>
      <span class="place-verdict">${t("fewerVerdict", Math.max(1, Math.round(candidate.expected - candidate.actual)))}</span>
      ${signalBadgeHtml(dong.trades[state.trade].signal)}
      ${candidate.sales_per_shop === "high" ? `<span class="badge">★ ${t("strongBadge")}</span>` : ""}
    </button>`);
  const { sales: salesMedian, close: closeMedian } = state.medians[state.trade];
  return `<h2 class="sheet-title">${t("tradeTitle", name)}</h2>
    ${referenceNote()}
    <p class="callout callout-${pattern.pattern}">${statusChip(patternStatus(pattern.pattern), t("patternShort")[pattern.pattern])} ${t("patterns")[pattern.pattern]}</p>
    <div class="place-list">${cards.join("") || `<p class="muted">${t("noCandidates")}</p>`}</div>
    <div class="actions"><button type="button" class="secondary-button" id="open-wishlist">${t("wishlistButton")}</button></div>
    <details class="more"><summary>${t("tradeSeoulTitle", name)}</summary>
      <div class="kn-grid">
        ${keyNumber(t("knSalesSeoul"), salesMedian === null ? "–" : formatWon(salesMedian), t("knPer3Months"))}
        ${keyNumber(t("knCloseSeoul"), closeMedian === null ? "–" : `${closeMedian.toFixed(1)}%`, t("knCloseSeoulNote"))}
      </div>
    </details>
    <p class="fine-print">${t("candidateExplain")} ${t("simHintTrade", name)}</p>`;
}

// D80: a report a shop owner reads in one look. First one sentence and the key numbers (D81: only the shops tile
// says what it is compared with; the others show the area's own number); then only the two basic charts (sales by time, people by hour); everything
// else (the checks, notes, every figure) is folded under "자세히 보기".
function dongView(dong) {
  if (!state.trade) return pickTradeView(dong);
  return `
    ${sheetHeader(dong)}
    ${referenceNote()}
    ${areaSummary(dong)}
    ${storySection(dong)}
    ${tradeVerdict(dong)}
    <section class="key-numbers" aria-label="${escapeHtml(t("readoutTitle"))}">
      <p class="eyebrow">${t("readoutTitle")}</p>
      <div class="kn-grid">${tradeKeyNumbers(dong).join("")}</div>
    </section>
    ${basicCharts(dong)}
    <div class="actions"><button type="button" class="primary-button" id="simulate-dong">${t("simulateHere", tradeName(state.trade))}</button></div>
    <div class="actions">
      <button type="button" class="secondary-button" id="zoom-stores">${t("zoomToStores")}</button>
      ${addCompareButton(dong)}
    </div>
    ${moreDetails(dong)}`;
}

function sheetHeader(dong) {
  const kicker = [state.trade ? tradeName(state.trade) : "", guName(dong)].filter(Boolean).map(escapeHtml).join(" / ");
  const romanized = getLanguage() === "ko" ? `<span class="sheet-romanized">${escapeHtml(dong.dong_en)}</span>` : "";
  return `<div class="sheet-header">
      <button type="button" class="icon-button" id="sheet-back" aria-label="${t("back")}">‹</button>
      <div class="sheet-heading"><p class="kicker">${kicker}</p><h2 class="sheet-title report-title">${escapeHtml(placeName(dong))}</h2>
        <p class="sheet-subtitle">${romanized}${escapeHtml(typeName(dong.type))} · ${escapeHtml(zoneName(dong.zone))}</p></div>
    </div>`;
}

function addCompareButton(dong) {
  const inCompare = state.compared.some((d) => d.code === dong.code);
  return `<button type="button" class="secondary-button" id="add-compare" ${inCompare ? "disabled" : ""}>${inCompare ? t("inCompare") : t("addCompare")}</button>`;
}

// D82: an area tapped without a trade opens no report; the panel asks for a trade, the area's leads first
function pickTradeView(dong) {
  const leads = state.overview.byDong.get(dong.code);
  const shown = new Set([...(leads?.suggested ?? []).map((c) => c.trade), ...(leads?.gaps ?? [])]);
  const others = Object.keys(state.meta.trade_subtypes).filter((trade) => !shown.has(trade))
    .map((trade) => `<button type="button" class="trade-chip" data-pick-trade="${escapeHtml(trade)}">${tradeIcon(trade)}${escapeHtml(tradeName(trade))}</button>`);
  return `
    ${sheetHeader(dong)}
    <p class="pick-trade-lead">${t("pickTradeLead")}</p>
    ${suggestedTradesSection(dong)}
    <section class="box">
      <h3 class="box-headline">${shown.size ? t("pickTradeOthers") : t("pickTradeAll")}</h3>
      <div class="chip-wrap">${others.join("")}</div>
    </section>
    <div class="actions">${addCompareButton(dong)}</div>`;
}

// ---------------------------------------------------------------------------
// The data story (D82): once a trade and an area are picked, the area's numbers one at a time, the map changing to
// match each step (its layer and legend). On by default; turning it off is remembered on this device.
// ---------------------------------------------------------------------------
const STORY_KEY = "seoulScout.story";
const STORY_HOUR = 13;   // the crowd step shows weekday 1 pm, the afternoon the model counts
const story = { on: readStoryOn(), step: 0, key: "" };

function readStoryOn() {
  try { return localStorage.getItem(STORY_KEY) !== "off"; } catch { return true; }   // storage blocked: on
}

// Each step: the map layer it shows and its sentence, from this area's own numbers; steps without data are left out
function storySteps(dong) {
  const values = dong.trades[state.trade] ?? {}, name = tradeName(state.trade);
  const expected = isKnown(values.expected) ? Math.round(values.expected) : null;
  const steps = [{ layer: "tradeGap", text: expected === null ? t("storyShopsOnly", name, values.shops ?? 0)
    : t("storyShops", name, values.shops ?? 0, expected) }];
  steps.push({ layer: "crowd", text: t("storyCrowd", formatNumber(dong.hourly.weekday[STORY_HOUR])) });
  if (isKnown(values.sales_per_shop)) steps.push({ layer: "tradeSales", text: t("storySales", name, formatWon(values.sales_per_shop)) });
  steps.push({ layer: "close", text: t("storyClose", Math.round(dong.kpi.close_rate_total)) });
  const rent = dong.kpi.rent_small_shop;
  if (dong.info.rent_area_km <= RENT_FAR_KM && isKnown(rent)) steps.push({ layer: "rent", text: t("storyRent", formatWon(rent * 1000 * 33)) });
  return steps;
}

function storySection(dong) {
  const key = `${state.trade}|${dong.code}`;
  if (story.key !== key) {   // a new area or trade starts the story again, on the map its first step shows
    story.key = key;
    story.step = 0;
    if (story.on && state.layer !== "tradeGap") queueMicrotask(() => setLayer("tradeGap"));
  }
  if (!story.on) {
    return `<div class="story-off"><button type="button" class="secondary-button" id="story-toggle">${t("storyOn")}</button></div>`;
  }
  const steps = storySteps(dong), step = Math.min(story.step, steps.length - 1);
  return `<section class="story" aria-label="${escapeHtml(t("storyTitle"))}">
      <div class="story-head"><p class="eyebrow">${t("storyTitle")} <span class="story-count">${step + 1} / ${steps.length}</span></p>
        <button type="button" class="text-button" id="story-toggle">${t("storyOff")}</button></div>
      <p class="story-text">${steps[step].text}</p>
      <div class="story-nav">
        <button type="button" class="secondary-button" id="story-prev" ${step === 0 ? "disabled" : ""}>‹ ${t("storyPrev")}</button>
        <button type="button" class="primary-button" id="story-next" ${step === steps.length - 1 ? "disabled" : ""}>${t("storyNext")} ›</button>
      </div>
    </section>`;
}

function goToStoryStep(step) {
  const steps = storySteps(state.selected);
  story.step = Math.max(0, Math.min(step, steps.length - 1));
  const { layer } = steps[story.step];
  if (layer === "crowd") { state.dayType = "weekday"; state.hour = STORY_HOUR; }
  setLayer(layer);
  renderSheet({ keepScroll: true });
}

function toggleStory() {
  story.on = !story.on;
  try { localStorage.setItem(STORY_KEY, story.on ? "on" : "off"); } catch { /* storage blocked: on for this visit only */ }
  story.step = 0;
  if (state.layer !== "tradeGap") setLayer("tradeGap");   // either way, back to the trade's own map
  renderSheet({ keepScroll: true });
}

// D82: the area in words, before any trade's numbers: who is here (residents or visitors, weekdays or weekends),
// what kinds of shop it has, and Seoul's official 상권; the model's 7 inputs fold under it
const BUSY_BY_DAY = 1.5, BUSY_BY_NIGHT = 0.8;      // weekday day ÷ night crowd (Seoul's middle area: about 0.86)
const WEEKEND_MORE = 1.15, WEEKEND_FEWER = 0.85;   // weekend ÷ weekday afternoon crowd (Seoul's middle area: about 1.08)

function areaSummary(dong) {
  const info = dong.info, sentences = [];
  const dayNight = info.day_night_ratio;
  if (isKnown(dayNight)) {
    if (dayNight >= BUSY_BY_DAY) sentences.push(t("summaryByDay", dayNight.toFixed(1)));
    else if (dayNight <= BUSY_BY_NIGHT) sentences.push(t("summaryByNight", (1 / dayNight).toFixed(1)));
    else sentences.push(t("summaryMixed"));
  }
  const weekend = info.weekend_weekday_ratio;
  if (isKnown(weekend)) {
    if (weekend >= WEEKEND_MORE) sentences.push(t("summaryWeekendMore", Math.round((weekend - 1) * 100)));
    else if (weekend <= WEEKEND_FEWER) sentences.push(t("summaryWeekendFewer", Math.round((1 - weekend) * 100)));
    else sentences.push(t("summaryWeekendSame"));
  }
  const mix = info.shop_mix ?? [];
  const total = mix.reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    const [first, second] = mix.map((n, group) => ({ n, group })).sort((a, b) => b.n - a.n);
    const share = (n) => Math.round((n / total) * 100);
    sentences.push(t("summaryShops", formatNumber(total), groupName(state.meta.groups[first.group]), share(first.n),
      groupName(state.meta.groups[second.group]), share(second.n)));
  }
  if (isKnown(info.n_districts)) sentences.push(t("summaryDistricts", Math.round(info.n_districts)));
  const percent = (share) => (isKnown(share) ? `${(share * 100).toFixed(1)}%` : "–");
  const inputs = [
    t("crowdNumber", formatNumber(dong.kpi.lp_wd_day)),
    `${formatNumber(dong.kpi.res_pop)}${t("people")}`,
    isKnown(weekend) ? t("timesNumber", weekend.toFixed(2)) : "–",
    percent(info.res_share_0_14), percent(info.res_share_65p), percent(info.long_foreign_share), percent(info.temp_foreign_share),
  ].map((value, index) => `<tr><td>${escapeHtml(t("inputLabels")[index])}</td><td>${value}</td></tr>`);
  return `<section class="area-summary">
      <p class="eyebrow">${t("summaryTitle")}</p>
      <p class="summary-text">${sentences.join(" ")}</p>
      <details class="summary-inputs"><summary>${t("inputsTitle")}</summary>
        <table class="figures">${inputs.join("")}</table>
        <p class="fine-print">${t("inputsNote")}</p></details>
    </section>`;
}

// One key number: what it is, the number, a note under it, and (the shops tile only, D81) a word for how it compares
function keyNumber(label, value, compare = "", chip = "") {
  return `<div class="kn"><p class="kn-label">${escapeHtml(label)}</p><p class="kn-value">${value}</p>`
    + `${compare ? `<p class="kn-compare">${compare}</p>` : ""}${chip}</div>`;
}

// A word in pink: what Seoul Scout points at (fewer shops than its crowd would usually mean)
function brandChip(label) {
  return `<span class="status status-brand"><span class="status-icon" aria-hidden="true">↓</span>${escapeHtml(label)}</span>`;
}

// The sentence above the numbers: does this area have fewer of the trade than its crowd would usually mean? (D81: said with its own numbers)
function tradeVerdict(dong) {
  const trade = state.trade, name = tradeName(trade);
  const values = dong.trades[trade] ?? {};
  const candidate = dong.trade_candidates.find((c) => c.trade === trade);
  const shops = values.shops ?? 0;
  const expected = isKnown(values.expected) ? Math.round(values.expected) : null;
  let headline = t("headShopsSimilar", name);
  if (expected !== null && values.resid <= -1) headline = t("verdictFewer", name, Math.max(1, expected - shops));
  else if (expected !== null && values.resid >= 1) headline = t("verdictMore", name, Math.max(1, shops - expected));
  const tags = [
    candidate ? statusChip("good", t("candidateTag")) : "",
    candidate?.sales_per_shop === "high" ? `<span class="badge">★ ${t("strongBadge")}</span>` : "",
  ].filter(Boolean).join(" ");
  // D81: the lead explained with the area's own numbers, not "similar areas"
  const reason = expected === null ? ""
    : `<p class="verdict-reason">${t("verdictReason", formatNumber(dong.kpi.lp_wd_day), formatNumber(dong.kpi.res_pop), name, shops, expected)}</p>`;
  return `<section class="verdict">
      <h3 class="verdict-headline">${headline}</h3>
      ${reason}
      ${tags ? `<p class="box-tag">${tags}</p>` : ""}
      ${values.signal ? signalDetails(values.signal) : ""}
    </section>`;
}

function tradeKeyNumbers(dong) {
  const trade = state.trade, name = tradeName(trade);
  const values = dong.trades[trade] ?? {};
  const shops = values.shops ?? 0;
  const expected = isKnown(values.expected) ? Math.round(values.expected) : null;
  let shopsChip = "";
  if (expected !== null) {
    if (values.resid <= -1) shopsChip = brandChip(t("fewerVerdict", Math.max(1, expected - shops)));
    else if (values.resid >= 1) shopsChip = statusChip("neutral", t("moreVerdict", Math.max(1, shops - expected)));
    else shopsChip = statusChip("neutral", t("sameVerdict"));
  }
  const enoughMix = values.time && values.age && shops >= MIN_MIX_SHOPS;
  const busiest = enoughMix ? values.time.indexOf(Math.max(...values.time)) : -1;
  const topAge = enoughMix ? values.age.indexOf(Math.max(...values.age)) : -1;
  const percent = (share) => Math.round(share * 100);
  return [
    keyNumber(t("knShops", name), t("shopsNumber", shops), expected === null ? "" : t("knShopsCompare", expected), shopsChip),
    keyNumber(t("knSales"), isKnown(values.sales_per_shop) ? formatWon(values.sales_per_shop) : "–",
      isKnown(values.sales_per_shop) ? "" : t("cellNoData")),
    keyNumber(t("knClose"), isKnown(values.close_rate) ? `${values.close_rate.toFixed(1)}%` : "–",
      isKnown(values.close_rate) ? "" : t("cellNoData")),
    keyNumber(t("cellBusiest"), busiest < 0 ? "–" : t("timeBands")[busiest],
      busiest < 0 ? t("cellNoData") : t("shareNumber", percent(values.time[busiest]))),
    keyNumber(t("knBuyers"), topAge < 0 ? "–" : t("buyerAges")[topAge],
      topAge < 0 ? t("cellNoData") : t("knBuyersCompare", percent(values.age[topAge]), percent(values.female ?? 0))),
    crowdKeyNumber(dong),
    rentKeyNumber(dong),
  ];
}

// All shops of the area: how many of every 100 closed in a year
function closeAllKeyNumber(dong) {
  return keyNumber(t("knCloseAll"), t("healthNumber", Math.round(dong.kpi.close_rate_total)));
}

function crowdKeyNumber(dong) {
  return keyNumber(t("knCrowd"), t("crowdNumber", formatNumber(dong.kpi.lp_wd_day)));
}

// Rent as a founder counts it: what a 10-pyeong (33 ㎡) shop pays a month
function rentKeyNumber(dong) {
  const rent = dong.kpi.rent_small_shop;
  if (dong.info.rent_area_km > RENT_FAR_KM || !isKnown(rent)) return keyNumber(t("knRent"), "–", t("knRentFar"));
  return keyNumber(t("knRent"), t("knRentValue", formatWon(rent * 1000 * 33)), t("rentNumber", rent));   // rent: 천원 per ㎡ a month
}

// The two basic charts: when the trade sells (with a trade) and when people are around
function basicCharts(dong) {
  const parts = [];
  const values = state.trade ? dong.trades[state.trade] ?? {} : null;
  if (values?.time && (values.shops ?? 0) >= MIN_MIX_SHOPS) {
    const busiest = values.time.indexOf(Math.max(...values.time));
    parts.push(box({
      headline: t("headBusiest", t("timeBands")[busiest]),
      picture: salesTimeChart(values.time, busiest),
      hint: t("hintSalesTime", t("timeBands")[busiest], Math.round(values.time[busiest] * 100)),
    }));
  }
  const peak = peakOf(dong.hourly);
  parts.push(box({
    headline: t("chartPeopleTitle", peak.hour, t(peak.dayType)),
    picture: `${hourlyChart(dong.hourly)}
      <p class="chart-caption"><span class="key weekday"></span>${t("weekday")} <span class="key weekend"></span>${t("weekend")}</p>`,
    hint: t("hintHourly", t(peak.dayType), peak.hour, formatNumber(peak.value)),
  }));
  return parts.join("");
}

// Everything else, folded: sentences rather than charts, then every figure in a table
function moreDetails(dong) {
  const lines = [];
  if (state.trade) {
    const values = dong.trades[state.trade] ?? {};
    const { ticket: ticketMedian, weekend: weekendMedian } = state.medians[state.trade];
    const pattern = state.data.trade_patterns.find((p) => p.trade === state.trade).pattern;
    lines.push(`<p class="sentence">${t("patterns")[pattern]}</p>`);
    if (isKnown(values.franchise)) lines.push(`<p class="sentence">${t("franchise", Math.round(values.franchise * 100))}</p>`);
    lines.push(trendSentence(values));
    if (values.time && (values.shops ?? 0) >= MIN_MIX_SHOPS) {
      lines.push(`<p class="sentence">${t("weekendSales", Math.round((values.weekend ?? 0) * 100), t("vsSeoul", weekendMedian ? values.weekend / weekendMedian : 1))}</p>`);
      if (values.ticket) lines.push(`<p class="sentence">${t("avgTicket", formatPrice(values.ticket), t("vsSeoul", ticketMedian ? values.ticket / ticketMedian : 1))}</p>`);
    }
    lines.push(`<p class="fine-print">${t("customersNote")}</p>`);
  }
  const ages = ["wd_day_share_0_19", "wd_day_share_20_34", "wd_day_share_35_49", "wd_day_share_50_64", "wd_day_share_65p"]
    .map((key) => dong.info[key] ?? 0);
  const ageText = ages.map((share, index) => `${t("ageBands")[index]} ${Math.round(share * 100)}%`).join(" · ");
  lines.push(`<p class="subhead">${t("whoComes")}</p><p class="sentence">${ageText}</p>`);
  lines.push(`<p class="sentence">${t("residentsSentence", formatNumber(dong.kpi.res_pop), rankText("res_pop", dong.kpi.res_pop))}</p>`);
  lines.push(`<p class="sentence">${t("openClose", Math.round(dong.kpi.open_rate_total), Math.round(dong.kpi.close_rate_total))}</p>`);
  const area = surveyPointName(dong), km = dong.info.rent_area_km;
  if (km > RENT_FAR_KM) lines.push(`<p class="sentence muted">${t("rentFar", escapeHtml(area), km.toFixed(1))}</p>`);
  else {
    lines.push(`<p class="sentence">${t("vacancySentence", Math.round(dong.kpi.vacancy_small_shop))}</p>`);
    lines.push(`<p class="fine-print">${t("rentWhere", escapeHtml(area), km === 0 ? 0 : km.toFixed(1))}</p>`);
  }
  const rows = Object.keys(state.data.kpis).map((key) => {
    const value = dong.kpi[key];
    return `<tr><td>${escapeHtml(t("kpiLabels")[key])}</td><td>${value === null ? "–" : value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td><td>${rankText(key, value)}</td></tr>`;
  });
  return `<details class="more"><summary>${t("moreDetails")}</summary>
      <div class="more-body">${lines.join("")}</div>
      <p class="subhead">${t("sectionMore")}</p><table class="figures">${rows.join("")}</table>
    </details>`;
}

// Without a trade: the trades this neighborhood is suggested for (or has a gap in), each one tap away
function suggestedTradesSection(dong) {
  const summary = state.overview.byDong.get(dong.code);
  if (!summary) return "";
  const suggested = summary.suggested.map((c) => `<button type="button" class="trade-chip suggested" data-pick-trade="${escapeHtml(c.trade)}">
      ${tradeIcon(c.trade)}${escapeHtml(tradeName(c.trade))}${c.sales_per_shop === "high" ? " ★" : ""}</button>`);
  const gapOnly = summary.gaps.filter((trade) => !summary.suggested.some((c) => c.trade === trade))
    .map((trade) => `<button type="button" class="trade-chip" data-pick-trade="${escapeHtml(trade)}">${tradeIcon(trade)}${escapeHtml(tradeName(trade))}</button>`);
  if (!suggested.length && !gapOnly.length) return "";
  const gapChips = gapOnly.length ? `<div class="chip-wrap">${gapOnly.join("")}</div>` : "";
  return box({
    headline: suggested.length ? t("dongSuggestedTitle") : t("dongGapsTitle"),
    picture: suggested.length
      ? `<div class="chip-wrap">${suggested.join("")}</div>${gapOnly.length ? `<p class="subhead">${t("dongGapsTitle")}</p>${gapChips}` : ""}`
      : gapChips,
    notes: `<p class="fine-print">${t("dongSuggestedNote")}</p>`,
  });
}

function trendSentence(values) {
  if (values.shops_change === null || values.shops_change === undefined) return "";
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
  const before = (values.shops ?? 0) - values.shops_change;
  const sales = values.sales_change === null || values.sales_change === undefined ? ""
    : t("salesChange", signed(Math.round(values.sales_change)), Math.abs(values.sales_change) > BIG_SALES_CHANGE);
  return `<p class="sentence">${t("shopsChange", before, values.shops ?? 0, signed(values.shops_change))}${sales}</p>`;
}

// Share of the trade's sales in each of the source's six time bands: ink bars, the busiest band in pink (D75)
function salesTimeChart(shares, busiest) {
  const rows = shares.map((share, index) => ({
    label: t("timeBands")[index], value: share, text: `${Math.round(share * 100)}%`,
    color: index === busiest ? COLORS.brand : COLORS.ink, strong: index === busiest,
  }));
  return barRows(rows, t("salesByTime"));
}

// Three rising bars like a phone's signal, the first 3 / 2 / 1 filled. Drawn, not the signal emoji: no emoji in the build.
function signalBars(level) {
  const filled = { strong: 3, medium: 2, weak: 1 }[level];
  const bars = [4, 8, 12].map((height, i) =>
    `<rect x="${i * 5}" y="${12 - height}" width="4" height="${height}" rx="1" fill="${i < filled ? COLORS.ink : COLORS.storeMuted}"/>`);
  return `<svg class="signal-bars" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">${bars.join("")}</svg>`;
}

// The 신호 세기 badge; opening it lists the three checks in plain words. Each sentence says pass or fail itself,
// so the ✓/✗ marks are hidden from screen readers.
function signalDetails(checks) {
  const level = signalLevel(checks);
  const items = checks.map((passed, i) => `<li class="${passed ? "passed" : "failed"}">`
    + `<span aria-hidden="true">${passed ? "✓" : "✗"}</span> ${t(passed ? "signalChecks" : "signalChecksFailed")[i]}</li>`);
  return `<details class="signal">
      <summary>${signalBars(level)}<span>${t("signalBadge", t("signalLevels")[level])}</span></summary>
      <ul class="signal-checks">${items.join("")}</ul>
      <p class="fine-print">${t("signalMeaning")}</p>
    </details>`;
}

// The small 신호 세기 badge on a 살펴볼 동네 card. A span, not <details>: the card is a button, which cannot hold
// another control. The card opens the report, where the badge lists its checks.
function signalBadgeHtml(checks) {
  const level = signalLevel(checks);
  return `<span class="signal-badge">${signalBars(level)}${t("signalBadge", t("signalLevels")[level])}</span>`;
}

// Horizontal bars, one row per value, scaled to the largest. Labels are HTML, so they keep their size at any
// panel width (D69). Empty when a value is missing: the caller says "no data" in words instead.
function barRows(rows, ariaLabel) {
  if (rows.some((row) => row.value === null || row.value === undefined)) return "";
  const highest = Math.max(...rows.map((row) => row.value)) || 1;
  const lines = rows.map((row) => `<div class="bar-row${row.strong ? " strong" : ""}">
      <span class="bar-label">${escapeHtml(row.label)}</span>
      <span class="bar-track"><i${row.color === COLORS.typical ? ' class="typical"' : ""} style="width:${((row.value / highest) * 100).toFixed(1)}%;background:${row.color}"></i></span>
      <span class="bar-text">${escapeHtml(row.text ?? "")}</span></div>`);
  return `<div class="bar-rows" role="img" aria-label="${escapeHtml(ariaLabel)}">${lines.join("")}</div>`;
}

// One idea per box: a plain headline first, then a picture with its 읽는 법, the number and short notes
// (spec 5.2, 5.7). No picture (a missing value), no hint.
function box({ headline, picture = "", hint = "", number = "", notes = "", tag = "" }) {
  return `<section class="box">
      <h3 class="box-headline">${headline}</h3>
      ${tag}${picture}${picture && hint ? chartHint(hint) : ""}${number ? `<p class="box-number">${number}</p>` : ""}${notes}
    </section>`;
}

// "? 읽는 법" under a chart. A <details>, so it opens by keyboard with no script, like the 신호 세기 badge.
function chartHint(text) {
  return `<details class="chart-hint"><summary><span class="hint-mark" aria-hidden="true">?</span>${t("hintSummary")}</summary>`
       + `<p>${escapeHtml(text)}</p></details>`;
}

// People by hour, weekday (line and area) and weekend (dashed). The lines stretch with the panel;
// the labels are HTML, so they keep their size (D69). The customer map draws only the chosen days and
// shades the chosen hours ([from, to] pairs) under the lines.
function hourlyChart(hourly, { days = ["weekday", "weekend"], shade = [] } = {}) {
  const width = 340, height = 100;   // drawing units only: the SVG stretches to the chart's box
  const highest = Math.max(...days.flatMap((day) => hourly[day]));
  const x = (hour) => (hour / 23) * width;
  const y = (value) => (1 - value / (highest || 1)) * height;   // a day with nobody stays a flat line
  const path = (values) => values.map((v, h) => `${h ? "L" : "M"}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${path(hourly.weekday)}L${x(23)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, 6, 12, 18, 23].map((h) => `<span style="left:${((h / 23) * 100).toFixed(1)}%">${h}</span>`).join("");
  const now = LAYERS[state.layer].timed
    ? `<line x1="${x(state.hour)}" x2="${x(state.hour)}" y1="0" y2="${height}" class="now-line"/>` : "";
  const shaded = shade.map(([from, to]) =>
    `<rect class="my-time" x="${x(from).toFixed(1)}" y="0" width="${(x(Math.min(to, 23)) - x(from)).toFixed(1)}" height="${height}"/>`);
  const weekday = days.includes("weekday")
    ? `<path d="${area}" class="weekday-area"/><path d="${path(hourly.weekday)}" class="weekday-line"/>` : "";
  const weekend = days.includes("weekend") ? `<path d="${path(hourly.weekend)}" class="weekend-line"/>` : "";
  return `<div class="chart hourly" role="img" aria-label="${t("layerCrowd")}">
      <span class="chart-max">${formatNumber(highest)}${t("people")}</span>
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        ${shaded.join("")}${weekday}${weekend}${now}</svg>
      <div class="chart-ticks">${ticks}</div>
    </div>`;
}

// The legend's key to the numbered pins and their ★ (D75). The "−N곳" example is pin 01's own figure, so the key
// never shows a number the map does not have (round 3: a fixed "−25곳" read as data on every trade).
function pinKeyHtml() {
  return `<p class="legend-extra legend-pin-key"><span class="pin" aria-hidden="true"><span class="pin-dot"></span>`
    + `<span class="pin-rank">01</span></span>${t(state.trade ? "pinKeyTrade" : "pinKeyHome")}</p>`
    + `<p class="legend-extra"><b class="pin-star" aria-hidden="true">★</b> ${t("strongBadge")}</p>`;
}

function renderLayerControl() {
  const box = document.getElementById("layer-control");
  const layer = LAYERS[state.layer];
  const available = ([, l]) => (state.customers ? l.customersOnly
    : !l.customersOnly && (!l.needsTrade || state.trade) && (!l.withoutTrade || !state.trade));
  const options = Object.entries(LAYERS).filter(available).map(([key, l]) =>
    `<button type="button" role="menuitemradio" aria-checked="${key === state.layer}" class="menu-item${key === state.layer ? " on" : ""}" data-layer="${key}">${escapeHtml(l.label())}</button>`);
  let legend = "";
  if (state.wishlist) {
    legend = legendHtml({ title: t("legendWishTitle"), colors: [SUGGESTED_STYLE.one.wash] });
  } else if (state.layer === "suggested") {
    legend = legendHtml({
      title: t("legendSuggestedTitle"),
      colors: [SUGGESTED_STYLE.gapOnly, SUGGESTED_STYLE.one, SUGGESTED_STYLE.several].map((style) => style.wash),
      words: t("suggestedLegend"),
      extra: pinKeyHtml(),
    });
  } else if (layer.diverging) {
    legend = legendHtml({
      title: t("legendGapTitle", tradeName(state.trade)),
      colors: GAP_STYLE.map((s) => s.wash),
      words: t("legendGapWords"),
      extra: state.sim ? "" : pinKeyHtml(),
    });
  } else if (layer.value) {
    legend = legendHtml({
      title: t("legendRampTitle", layer.label()),
      colors: OPACITY_STEPS.map((opacity) => hexToRgba(layer.color, opacity)),   // the same 5 classes the map draws
      words: [t("bandLow"), t("bandHigh")],
      extra: state.customers?.narrow.length ? `<p class="legend-extra">${t("legendCustomersExtra")}</p>` : "",
    });
  }
  const time = layer.timed ? `
    <div class="time-control">
      <div class="segmented" role="group">
        <button type="button" data-day="weekday" class="${state.dayType === "weekday" ? "on" : ""}">${t("weekday")}</button>
        <button type="button" data-day="weekend" class="${state.dayType === "weekend" ? "on" : ""}">${t("weekend")}</button>
      </div>
      <div class="slider-row">
        <button type="button" class="play" id="play" aria-label="${state.playing ? t("pause") : t("play")}">${state.playing ? "❚❚" : "▶"}</button>
        <input type="range" min="0" max="23" step="1" value="${state.hour}" id="hour" aria-label="${t("layerCrowd")}">
        <span class="hour-label">${t("hourLabel", state.hour)}</span>
      </div>
    </div>` : "";
  box.innerHTML = `
    <button type="button" class="layer-button" id="layer-toggle" aria-haspopup="menu" aria-expanded="${box.classList.contains("open")}">
      <span class="layer-icon" aria-hidden="true">${LAYERS_ICON}</span><span>${t("layerButton")}: <b>${escapeHtml(state.wishlist ? t("wishlistLegend") : layer.label())}</b></span><span class="layer-chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4"/></svg></span></button>
    <div class="layer-menu" role="menu">${options.join("")}</div>${legend}${time}${shopLegendHtml()}`;
  box.querySelector("#layer-toggle").addEventListener("click", () => {
    box.classList.toggle("open");
    box.querySelector("#layer-toggle").setAttribute("aria-expanded", box.classList.contains("open"));
  });
  for (const item of box.querySelectorAll(".menu-item")) {
    item.addEventListener("click", () => { box.classList.remove("open"); setLayer(item.dataset.layer); });
  }
  for (const button of box.querySelectorAll("[data-day]")) {
    button.addEventListener("click", () => { state.dayType = button.dataset.day; restyleAll(); renderLayerControl(); if (state.selected) renderSheet({ keepScroll: true }); });
  }
  box.querySelector("#hour")?.addEventListener("input", (event) => {
    state.hour = Number(event.target.value);
    restyleAll();
    box.querySelector(".hour-label").textContent = t("hourLabel", state.hour);
  });
  box.querySelector("#play")?.addEventListener("click", togglePlay);
}

// The legend: what the colour means as a sentence, the colours the map draws, and a few words under them (D69)
function legendHtml({ title, colors, words = [], extra = "" }) {
  const bar = colors.map((color) => `<span style="background:${color}"></span>`).join("");
  const under = words.map((word) => `<span>${escapeHtml(word)}</span>`).join("");
  return `<div class="legend"><p class="legend-title">${title}</p><div class="legend-bar">${bar}</div>
    <div class="legend-words">${under}</div>${extra}</div>`;
}

// The legend's "가게" section (D71): the same markers the map draws, from zoom 14 where they show
function shopLegendHtml() {
  if (!state.dots?.streetLevel) return "";
  const rows = [];
  if (state.trade) {
    rows.push(`<li>${markerSvg("main", state.trade)}<span>${escapeHtml(t("legendMainShops", tradeName(state.trade)))}</span></li>`);
    // while simulating, the trade's shops outside the walk are small rings (store-dots.js setWalkArea)
    if (state.sim) rows.push(`<li><span class="dot-key outside"></span><span>${escapeHtml(t("legendOutsideWalk", tradeName(state.trade)))}</span></li>`);
  }
  for (const kind of state.extraKinds) {
    rows.push(`<li>${markerSvg("extra", kindIconKey(kind, state.meta))}<span>${escapeHtml(state.meta.subtypes[kind])}</span></li>`);
  }
  const other = state.dots.active ? t("legendOtherShops") : t("legendOtherShopsZoom");
  const sample = ["cafe", "food", "retail"].map((key) => markerSvg("group", key)).join("");
  rows.push(`<li><span class="legend-icons">${sample}</span><span>${other}</span></li>`);
  return `<div class="legend-shops"><p class="legend-title">${t("legendShopsTitle")}</p><ul>${rows.join("")}</ul></div>`;
}

function renderCompareButton() {
  const button = document.getElementById("compare-open");
  button.hidden = state.compared.length === 0;
  button.textContent = t("compareButton", state.compared.length);
}

function renderCompare() {
  const dialog = document.getElementById("compare-dialog");
  const trade = state.trade, name = tradeName(trade);
  const row = (label, cell) => `<tr><th scope="row">${label}</th>${state.compared.map((d) => `<td>${cell(d)}</td>`).join("")}</tr>`;
  const rows = [row("", (d) => escapeHtml(typeName(d.type)))];
  if (trade) {
    rows.push(row(t("tileShops", name), (d) => `${d.trades[trade]?.shops ?? 0} <span class="muted">/ ${Math.round(d.trades[trade]?.expected ?? 0)}</span>`));
    rows.push(row(t("tileSales"), (d) => (d.trades[trade]?.sales_per_shop ? formatWon(d.trades[trade].sales_per_shop) : "–")));
    rows.push(row(`${name} · ${t("tileClose")}`, (d) => (d.trades[trade]?.close_rate === null || d.trades[trade]?.close_rate === undefined ? "–" : `${d.trades[trade].close_rate.toFixed(1)}%`)));
  }
  const label = t("compareLabels");
  rows.push(row(label.people, (d) => t("comparePeople", formatNumber(d.kpi.lp_wd_day))));
  rows.push(row(label.close, (d) => `${d.kpi.close_rate_total.toFixed(1)}%`));
  rows.push(row(label.rent, (d) => (d.info.rent_area_km > RENT_FAR_KM ? "–" : t("rentShort", d.kpi.rent_small_shop))));
  rows.push(row(label.perPeople, (d) => t("comparePerPeople", d.kpi.stores_per_1k_wd_day.toFixed(1))));
  const header = state.compared.map((d) => `<th scope="col">${escapeHtml(placeName(d))}<button type="button" class="icon-button remove" data-code="${d.code}" aria-label="${t("close")}">×</button></th>`);
  dialog.querySelector(".dialog-body").innerHTML = `<h2 class="sheet-title">${t("compareTitle")}</h2>
    <table class="compare-table"><thead><tr><th></th>${header.join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>
    <button type="button" class="text-button" id="clear-compare">${t("clearCompare")}</button>`;
  for (const button of dialog.querySelectorAll(".remove")) {
    button.addEventListener("click", () => {
      state.compared = state.compared.filter((d) => d.code !== button.dataset.code);
      renderCompareButton();
      if (state.compared.length) renderCompare(); else dialog.close();
      if (state.selected) renderSheet({ keepScroll: true });
    });
  }
  dialog.querySelector("#clear-compare").addEventListener("click", () => {
    state.compared = [];
    renderCompareButton();
    dialog.close();
    if (state.selected) renderSheet({ keepScroll: true });
  });
}

// ---------------------------------------------------------------------------
// Controls that exist once
// ---------------------------------------------------------------------------
function bindControls() {
  document.getElementById("language").addEventListener("click", () => {
    setLanguage(getLanguage() === "ko" ? "en" : "ko");
    for (const [layerId, text] of Object.entries(labelTexts(getLanguage()))) state.map.setLayoutProperty(layerId, "text-field", text);
    for (const layerId of ["gu-names", "dong-names"]) state.map.setLayoutProperty(layerId, "text-field", placeLabelField());
    renderAll();
    drawPins();
    if (state.card) openCard(state.dots.buildingByPosition(state.card));
    if (state.sim) state.sim.marker.getElement().querySelector(".my-shop-label").textContent = t("myShop", tradeName(state.trade));
    writeLink();
  });
  const helpDialog = document.getElementById("help-dialog");
  document.getElementById("help").addEventListener("click", () => openHelp("help"));
  document.getElementById("help-close").addEventListener("click", () => {
    if (helpDialog.dataset.kind === "welcome") endTour();   // the welcome reached by going back in the tour
    helpDialog.close();
  });
  helpDialog.addEventListener("cancel", () => { if (helpDialog.dataset.kind === "welcome") endTour(); });   // ESC
  helpDialog.addEventListener("close", () => { if (helpDialog.dataset.kind === "welcome") markWelcomed(); });  // any way out of it
  document.getElementById("zoom-in").addEventListener("click", () => state.map.zoomIn());
  document.getElementById("zoom-out").addEventListener("click", () => state.map.zoomOut());
  document.getElementById("seoul-all").addEventListener("click", () => fitSeoul());
  document.getElementById("compare-open").addEventListener("click", () => {
    renderCompare();
    document.getElementById("compare-dialog").showModal();
  });
  document.getElementById("compare-close").addEventListener("click", () => document.getElementById("compare-dialog").close());
  bindSheetHandle();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCard();
      document.getElementById("layer-control").classList.remove("open");
    }
  });
  bindSearch();
}

function bindSheet() {
  const on = (selector, handler) => document.getElementById(selector)?.addEventListener("click", handler);
  const dongOf = (code) => state.data.dongs.find((d) => d.code === code);
  on("sheet-back", clearSelection);
  for (const card of document.querySelectorAll(".place-card, .example-open")) {
    card.addEventListener("click", () => {
      if (card.dataset.leadTrade) openLead(card.dataset.leadTrade, dongOf(card.dataset.code));
      else selectDong(dongOf(card.dataset.code), { zoom: true });
    });
  }
  for (const bar of document.querySelectorAll(".trade-bar")) bar.addEventListener("click", () => chooseTrade(bar.dataset.trade));
  for (const chip of document.querySelectorAll("[data-pick-trade]")) {
    chip.addEventListener("click", () => openLead(chip.dataset.pickTrade, state.selected));
  }
  on("toggle-leads", () => { state.allLeads = !state.allLeads; renderSheet({ keepScroll: true }); });
  on("story-toggle", toggleStory);
  on("story-prev", () => goToStoryStep(story.step - 1));
  on("story-next", () => goToStoryStep(story.step + 1));
  on("start-tour", beginTour);
  on("show-overview", () => setLayer("suggested"));
  on("hide-overview", () => setLayer("none"));
  on("open-wishlist", openWishlist);
  on("wishlist-back", closeWishlist);
  for (const button of document.querySelectorAll("#sheet-body [data-open-customers]")) {
    button.addEventListener("click", () => openCustomers());
  }
  on("customers-back", closeCustomers);
  for (const list of ["who", "when", "narrow"]) {
    for (const chip of document.querySelectorAll(`#sheet-body [data-${list}]`)) {
      chip.addEventListener("click", () => toggleCustomerChoice(list, chip.dataset[list]));
    }
  }
  for (const bar of document.querySelectorAll("#sheet-body .customer-bar")) {
    bar.addEventListener("click", () => selectDong(dongOf(bar.dataset.code), { zoom: true }));
  }
  document.getElementById("idea-name")?.addEventListener("input", (event) => { state.customers.name = event.target.value; });
  if (document.getElementById("similar-search")) bindExtraKinds(document.getElementById("sheet-body"), "similar");
  for (const chip of document.querySelectorAll("[data-criterion]")) chip.addEventListener("click", () => toggleCriterion(chip.dataset.criterion));
  on("simulate-dong", async () => {
    const dong = state.selected;
    const [lng, lat] = await state.dots.storeCenter(codeOfGuName()[dong.gu], dong.code) ?? [dong.center[1], dong.center[0]];
    startSimulation(lng, lat);
  });
  bindSimulationControls();
  document.getElementById("zoom-stores")?.addEventListener("click", async () => {
    const dong = state.selected;
    const center = await state.dots.storeCenter(codeOfGuName()[dong.gu], dong.code) ?? [dong.center[1], dong.center[0]];
    state.map.easeTo({ center, zoom: STREET_ZOOM, offset: freeAreaOffset(), duration: 800 });
  });
  document.getElementById("add-compare")?.addEventListener("click", () => {
    if (!state.compared.some((d) => d.code === state.selected.code)) {
      state.compared = [...state.compared, state.selected].slice(-MAX_COMPARED);
    }
    renderCompareButton();
    renderSheet({ keepScroll: true });
  });
}

// A lead from the opening view (or a trade chip in a neighborhood): choose its trade and open the neighborhood
function openLead(trade, dong) {
  chooseTrade(trade, false);
  renderAll();
  selectDong(dong, { zoom: true });
}

// ---------------------------------------------------------------------------
// Find by wishlist (wishlist.js): tick conditions, see the neighborhoods meeting all of them in pink
// ---------------------------------------------------------------------------
function openWishlist() {
  state.wishlist = [];
  state.selected = null;
  showOutline("dong-selected", null);
  updateWishMatches();
  refreshWishlistMap();
  fitSeoul();
}

function closeWishlist() {
  state.wishlist = null;
  state.wishMatches = new Set();
  refreshWishlistMap();
}

function toggleCriterion(key) {
  const chosen = new Set(state.wishlist);
  if (chosen.has(key)) chosen.delete(key); else chosen.add(key);
  state.wishlist = CRITERIA.map((c) => c.key).filter((k) => chosen.has(k));    // keep the list order
  updateWishMatches();
  refreshWishlistMap();
}

function updateWishMatches() {
  const result = currentWishResult();
  state.wishMatches = new Set(state.wishlist.length ? result.matches.map(({ dong }) => dong.code) : []);
}

function currentWishResult() {
  return findMatches(state.data.dongs, state.wishlist, state.trade, state.wishRefs, state.medians[state.trade]);
}

function refreshWishlistMap() {
  restyleAll();
  drawPins();
  renderLayerControl();
  renderSheet();
}

function wishlistView() {
  const groups = ["customers", "risk", "trade"].map((group) => {
    const chips = CRITERIA.filter((c) => c.group === group).map((criterion) => {
      const disabled = criterion.needsTrade && !state.trade;
      const chosen = state.wishlist.includes(criterion.key);
      return `<button type="button" class="chip${chosen ? " on" : ""}" data-criterion="${criterion.key}" aria-pressed="${chosen}" ${disabled ? "disabled" : ""}>
        <span class="check" aria-hidden="true">${chosen ? "✓" : "+"}</span>${escapeHtml(criterionLabel(criterion.key))}</button>`;
    });
    return `<p class="subhead">${escapeHtml(t("wishlistGroups")[group](state.trade ? tradeName(state.trade) : ""))}</p><div class="chip-wrap">${chips.join("")}</div>`;
  });
  return `<div class="sheet-header">
      <button type="button" class="icon-button" id="wishlist-back" aria-label="${t("back")}">‹</button>
      <div class="sheet-heading"><h2 class="sheet-title">${t("wishlistTitle")}</h2>
        <p class="sheet-subtitle">${state.trade ? escapeHtml(tradeName(state.trade)) : t("wishlistAllTrades")}</p></div>
    </div>
    <p class="sheet-lead">${t("wishlistIntro")}</p>
    ${groups.join("")}
    ${state.trade ? "" : `<p class="fine-print">${t("needsTradeNote")}</p>`}
    <section class="box">${wishlistResults()}</section>`;
}

function criterionLabel(key) {
  const label = t("criteria")[key];
  return typeof label === "function" ? label(state.trade ? tradeName(state.trade) : "") : label;
}

function wishlistResults() {
  if (!state.wishlist.length) return `<p class="muted">${t("wishlistNone")}</p>`;
  const { matches, nearMisses } = currentWishResult();
  const card = ({ dong, missing }) => `<button type="button" class="place-card" data-code="${dong.code}">
      <span class="place-name">${escapeHtml(placeName(dong))} <span class="place-gu">${escapeHtml(guName(dong))} · ${escapeHtml(typeName(dong.type))}</span></span>
      <span class="place-line">${wishLine(dong)}</span>
      ${missing.length ? `<span class="status status-neutral"><span class="status-icon" aria-hidden="true">–</span>${escapeHtml(t("missingLabel", criterionLabel(missing[0])))}</span>` : ""}
    </button>`;
  const shown = matches.slice(0, 12);
  let html = `<h3 class="box-headline">${t("wishlistCount", matches.length)}</h3>`;
  html += shown.length ? `<div class="place-list">${shown.map(card).join("")}</div>` : `<p class="muted">${t("wishlistEmpty")}</p>`;
  if (matches.length > shown.length) html += `<p class="fine-print">${t("wishlistMore", matches.length - shown.length)}</p>`;
  if (matches.length < 3 && nearMisses.length) {
    html += `<p class="subhead">${t("nearMissTitle")}</p><div class="place-list">${nearMisses.slice(0, 5).map(card).join("")}</div>`;
  }
  return html;
}

function wishLine(dong) {
  if (!state.trade) return t("crowdShort", formatNumber(dong.kpi.lp_wd_day));
  const values = dong.trades[state.trade] ?? {};
  return t("candidateLine", tradeName(state.trade), values.shops ?? 0, Math.round(values.expected ?? 0));
}

// ---------------------------------------------------------------------------
// The customer map "내 손님 지도" (customers.js, spec 5.6, D73): for a shop not on the list, the founder picks
// who their customers are and when they come; areas with more of those people are a darker blue.
// ---------------------------------------------------------------------------
function loadCustomerData() {
  state.customerData ??= fetchJson("data/customers.json").then((json) => ({
    byCode: new Map(json.dongs.map((entry) => [entry.code, entry])),
    refs: narrowReferences(json.dongs),
  }));
  return state.customerData;
}

// The file loads first, so a failed or slow load leaves the app where it was
async function openCustomers(choice = {}) {
  try {
    state.customerTable = await loadCustomerData();
  } catch (error) {
    console.warn("customers.json:", error.message);
    state.customerData = null;                    // the next tap fetches again
    showToast(t("customersLoadError"));
    return;
  }
  chooseTrade("", false);                         // also ends a simulation and leaves a trade
  state.wishlist = null;
  state.wishMatches = new Set();
  state.selected = null;
  showOutline("dong-selected", null);
  state.customers = { ...cleanChoice(choice), name: "" };
  state.layer = "customers";
  drawPins();
  renderAll();
  fitSeoul();
  writeLink();
}

function closeCustomers() {
  state.customers = null;
  state.selected = null;
  showOutline("dong-selected", null);
  state.layer = "none";
  drawPins();
  renderAll();
  writeLink();
}

function toggleCustomerChoice(list, key) {
  const chosen = state.customers[list];
  const next = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key];
  state.customers = { ...state.customers, ...cleanChoice({ ...state.customers, [list]: next }) };
  restyleAll();
  renderLayerControl();
  renderSheet({ keepScroll: true });
  writeLink();
}

// How many of the chosen people an area has at the chosen times; null when nothing is chosen or a switch fails
function customerValue(dong) {
  const choice = state.customers, table = state.customerTable;
  const entry = table?.byCode.get(dong.code);
  if (!choice || !entry) return null;
  if (!choice.narrow.every((key) => meetsNarrow(key, dong, entry, table.refs, state.wishRefs))) return null;
  return customerCount(entry.people, choice.who, choice.when);
}

// Seoul's ordinary area: the median over all 424, without the switches
function customerTypical() {
  const { who, when } = state.customers;
  return median([...state.customerTable.byCode.values()].map((entry) => customerCount(entry.people, who, when)));
}

function similarShops(dong) {
  const shops = state.customerTable.byCode.get(dong.code).shops;
  return state.extraKinds.reduce((sum, kind) => sum + shops[kind], 0);
}

function customerChips(keys, chosen, list, labels) {
  const chips = keys.map((key) => {
    const on = chosen.includes(key);
    return `<button type="button" class="chip${on ? " on" : ""}" data-${list}="${key}" aria-pressed="${on}">
      <span class="check" aria-hidden="true">${on ? "✓" : "+"}</span>${escapeHtml(labels[key])}</button>`;
  });
  return `<div class="chip-wrap">${chips.join("")}</div>`;
}

function customersView() {
  const { who, when, narrow, name } = state.customers;
  return `<div class="sheet-header">
      <button type="button" class="icon-button" id="customers-back" aria-label="${t("back")}">‹</button>
      <div class="sheet-heading"><h2 class="sheet-title">${t("customersTitle")}</h2>
        <p class="sheet-subtitle">${t("customersSubtitle")}</p></div>
    </div>
    ${referenceNote()}
    <label class="idea-name">${t("ideaNameLabel")}
      <input type="text" id="idea-name" maxlength="30" placeholder="${escapeHtml(t("ideaNamePlaceholder"))}" value="${escapeHtml(name)}"></label>
    <p class="subhead">${t("whoTitle")}</p>
    ${customerChips(CUSTOMER_GROUPS, who, "who", t("customerGroups"))}
    <p class="fine-print">${t("visitorsNote")}</p>
    <p class="subhead">${t("whenTitle")}</p>
    ${customerChips(Object.keys(TIME_BANDS), when, "when", t("customerTimes"))}
    ${extraKindsHtml("similar", t("similarTitle"))}
    <p class="subhead">${t("narrowTitle")}</p>
    ${customerChips(NARROW_KEYS, narrow, "narrow", t("narrowLabels"))}
    <section class="box">${customerResults()}</section>`;
}

function customerResults() {
  const { who, when, narrow } = state.customers;
  if (!who.length || !when.length) return `<p class="muted">${t("customersPick")}</p>`;
  const rows = state.data.dongs.map((dong) => ({ dong, count: customerValue(dong) })).filter((row) => row.count !== null);
  if (!rows.length) return `<p class="muted">${t("customersNone")}</p>`;
  rows.sort((a, b) => b.count - a.count);
  const typical = customerTypical();
  return `<h3 class="box-headline">${t("customersTopTitle")}</h3>
    ${customerBars(rows.slice(0, 5), typical)}
    ${chartHint(t("hintCustomerBars", placeName(rows[0].dong), formatNumber(rows[0].count), formatNumber(typical)))}
    <p class="fine-print">${t("customersTypical", formatNumber(typical))}</p>
    ${narrow.length ? `<p class="fine-print">${t("customersMatching", rows.length)}</p>` : ""}`;
}

// The top areas as bars, with Seoul's ordinary area as a dashed line. A group, not an image: each bar is a button.
function customerBars(rows, typical) {
  const highest = Math.max(rows[0].count, typical);   // the dashed line stays inside the track
  const share = (value) => `${((100 * value) / highest).toFixed(1)}%`;
  const bars = rows.map(({ dong, count }) => {
    const similar = state.extraKinds.length ? `<span class="customer-line">${t("similarLine", similarShops(dong))}</span>` : "";
    return `<button type="button" class="customer-bar" data-code="${dong.code}">
      <span class="customer-name">${escapeHtml(placeName(dong))}</span>
      <span class="customer-track"><span class="customer-fill" style="width:${share(count)};background:${COLORS.people}"></span>
        <span class="customer-typical" style="left:${share(typical)}"></span></span>
      <span class="customer-number">${formatNumber(count)}${t("people")}</span>${similar}</button>`;
  });
  return `<div class="customer-bars" role="group" aria-label="${escapeHtml(t("customersAria"))}">${bars.join("")}</div>`;
}

// An area's report inside the customer map: my customers at my times, similar shops, then closures and rent
function customerDongView(dong) {
  const headline = t("customerHeadline", placeName(dong), state.customers.name.trim());
  return `
    <div class="sheet-header">
      <button type="button" class="icon-button" id="sheet-back" aria-label="${t("back")}">‹</button>
      <div class="sheet-heading"><h2 class="sheet-title">${escapeHtml(headline)}</h2>
        <p class="sheet-subtitle">${escapeHtml(guName(dong))} · ${escapeHtml(typeName(dong.type))} · ${escapeHtml(zoneName(dong.zone))}</p></div>
    </div>
    ${referenceNote()}
    ${customerSection(dong)}
    ${similarSection(dong)}
    <section class="key-numbers"><div class="kn-grid">${[closeAllKeyNumber(dong), rentKeyNumber(dong)].join("")}</div></section>
    <div class="actions"><button type="button" class="secondary-button" id="zoom-stores">${t("zoomToStores")}</button></div>`;
}

// The chosen people hour by hour on the chosen days, the chosen times shaded, against Seoul's ordinary area
function customerSection(dong) {
  const { who, when } = state.customers;
  const people = state.customerTable.byCode.get(dong.code).people;
  const count = customerCount(people, who, when);
  if (count === null) return box({ headline: t("myCustomersPickHead") });
  const everyCount = [...state.customerTable.byCode.values()].map((entry) => customerCount(entry.people, who, when));
  const days = curveDays(when);
  const busiest = busiestTime(people, who, when);
  const curves = { weekday: customerCurve(people, who, "weekday"), weekend: customerCurve(people, who, "weekend") };
  const shade = when.map((key) => [TIME_BANDS[key].from, TIME_BANDS[key].to]);
  const keys = days.map((day) => `<span class="key ${day}"></span>${t(day)}`).join(" ");
  return box({
    headline: t("myCustomersHead")[band(everyCount, count)],
    picture: `${hourlyChart(curves, { days, shade })}
      <p class="chart-caption">${keys} <span class="key my-time"></span>${t("myTimeKey")} · ${t("customerPeak", busiest.hour, t(busiest.dayType))}</p>`,
    hint: t("hintCustomerCurve", t(busiest.dayType), busiest.hour, formatNumber(busiest.value)),
    number: `${t("myCustomersNumber", formatNumber(count))} <span>${t("myCustomersTypical", formatNumber(customerTypical()))}</span>`,
    notes: who.includes("visitors") ? `<p class="fine-print">${t("visitorsNote")}</p>` : "",
  });
}

// Similar shops are counted, never judged: more is not worse and fewer is not better
function similarSection(dong) {
  // nothing picked yet: no box (an empty one reads as a placeholder); the kind picker on the left offers the choice
  if (!state.extraKinds.length) return "";
  const shops = state.customerTable.byCode.get(dong.code).shops;
  const rows = state.extraKinds.map((kind) => `<li>${markerSvg("extra", kindIconKey(kind, state.meta))}
      <span>${escapeHtml(state.meta.subtypes[kind])}</span><b class="similar-count">${t("similarCount", shops[kind])}</b></li>`);
  return box({
    headline: t("similarHead"),
    picture: `<ul class="similar-list">${rows.join("")}</ul>`,
    notes: `<p class="fine-print">${t("similarNote")}</p>`,
  });
}

// ---------------------------------------------------------------------------
// Simulation (simulation.js): "what if I open my shop here?"
// A pink pin marks the shop; the 5-minute walk around it is drawn, competitors inside get a red ring, and the
// neighborhood's gap tint can be shown before and after the shop opens. Tap the map or drag the pin to move it.
// ---------------------------------------------------------------------------
function addSimulationLayers() {
  const map = state.map;
  map.addSource("sim-area", { type: "geojson", data: EMPTY });
  // the 5-minute walk: a thin ink dash, no fill, so "내 가게" is the only pink on the map (round 5: a pink
  // ring and wash with the rivals' rings read as one pink-red texture). Dash lengths are in line widths: 4 px on, 4 off.
  map.addLayer({ id: "sim-area-line", type: "line", source: "sim-area",
    paint: { "line-color": COLORS.ink, "line-width": 1.5, "line-dasharray": [2.67, 2.67] } }, OUTLINE_BEFORE);
  map.addSource("sim-rivals", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "sim-rivals-ring", type: "circle", source: "sim-rivals",
    // a small red dot under each rival's marker (risk: inside the walk): where a crowded street hides the marker, the dot still counts it
    // (an empty ring per building piled up into a tangle, round 2)
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 3, 18, 4.5], "circle-color": COLORS.risk,
             "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } }, DOTS_BEFORE);
  map.addLayer({ id: "sim-rivals-label", type: "symbol", source: "sim-rivals", filter: ["get", "labeled"],
    layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Medium"], "text-size": 11, "text-anchor": "top",
              "text-offset": [0, 1.6], "text-allow-overlap": true },     // below the ring
    paint: { "text-color": COLORS.riskText, "text-halo-color": "#ffffff", "text-halo-width": 1.6 } }, DOTS_BEFORE);
}

async function startSimulation(lng, lat) {
  const dong = dongAtLngLat(lng, lat);
  if (!state.trade || !dong) return;
  closeCard();
  state.wishlist = null;
  state.wishMatches = new Set();
  state.layer = "tradeGap";
  stopPlaying();
  const element = document.createElement("div");
  element.className = "my-shop";
  element.innerHTML = `<span class="my-shop-label">${escapeHtml(t("myShop", tradeName(state.trade)))}</span><span class="my-shop-pin"></span>`;
  const marker = new maplibregl.Marker({ element, anchor: "bottom", draggable: true }).setLngLat([lng, lat]).addTo(state.map);
  marker.on("dragend", () => { const at = marker.getLngLat(); moveSimulation(at.lng, at.lat); });
  state.sim = { lng, lat, dong, marker, showAfter: true, areaM2: TYPICAL_AREA_M2[state.trade] ?? 50, nearby: [], result: null };
  state.dots.setNamesFromZoom(SIM_NAMES_ZOOM);
  state.selected = dong;
  showOutline("dong-selected", dong);
  drawPins();
  renderLayerControl();
  state.map.easeTo({ center: [lng, lat], zoom: simulationZoom(lng, lat), offset: freeAreaOffset(), duration: 800 });
  await updateSimulation();
}

// Close enough to see the store dots, and far enough (where the screen is small) to see the whole 5-minute walk
function simulationZoom(lng, lat) {
  const ring = circlePolygon(lng, lat, WALK_RADIUS_M).geometry.coordinates[0];
  const lngs = ring.map(([x]) => x), lats = ring.map(([, y]) => y);
  const bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
  const fit = state.map.cameraForBounds(bounds, { padding: mapPadding() });
  return Math.min(SIM_ZOOM, Math.max(DOTS_MIN_ZOOM, fit?.zoom ?? SIM_ZOOM));
}

async function moveSimulation(lng, lat) {
  const dong = dongAtLngLat(lng, lat);
  if (!dong) {
    showToast(t("simOutside"));
    state.sim.marker.setLngLat([state.sim.lng, state.sim.lat]);
    return;
  }
  Object.assign(state.sim, { lng, lat, dong });
  state.sim.marker.setLngLat([lng, lat]);
  if (state.selected !== dong) {
    state.selected = dong;
    showOutline("dong-selected", dong);
  }
  await updateSimulation();
}

// Load the 구 files the walk area touches, count competitors inside it, and recompute
async function updateSimulation({ keepScroll = false } = {}) {
  const sim = state.sim;
  const codes = guCodesNear(sim.lng, sim.lat, WALK_RADIUS_M);
  await Promise.all(codes.map((code) => state.dots.load(code)));
  if (state.sim !== sim) return;                          // ended while loading
  sim.nearby = state.dots.competitorsNear(sim.lng, sim.lat, WALK_RADIUS_M);
  const pattern = state.data.trade_patterns.find((p) => p.trade === state.trade).pattern;
  sim.result = simulateOpening({
    dong: sim.dong, trade: state.trade, pattern, spread: state.gapSpread[state.trade], seoul: state.medians[state.trade],
    nearby: sim.nearby, areaM2: sim.areaM2, rentKnown: sim.dong.info.rent_area_km <= RENT_FAR_KM,
  });
  drawSimulationMap();
  restyleAll();
  renderSheet({ keepScroll });
}

function drawSimulationMap() {
  const sim = state.sim;
  const area = circlePolygon(sim.lng, sim.lat, WALK_RADIUS_M);
  state.map.getSource("sim-area").setData(area);
  state.dots.setWalkArea(area.geometry);
  // one ring per building; the three nearest buildings get their distance
  const buildings = new Map();
  for (const rival of sim.nearby) {
    const key = `${rival.lng},${rival.lat}`;
    if (!buildings.has(key)) buildings.set(key, rival);
  }
  const features = [...buildings.values()].map((rival, index) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [rival.lng, rival.lat] },
    properties: { labeled: index < 3, label: t("meters", Math.round(rival.distance)) },
  }));
  state.map.getSource("sim-rivals").setData({ type: "FeatureCollection", features });
  sim.marker.getElement().classList.toggle("before", !sim.showAfter);
}

function endSimulation(render = true) {
  const sim = state.sim;
  if (!sim) return;
  sim.marker.remove();
  state.sim = null;
  state.dots.setNamesFromZoom(null);
  state.dots.setWalkArea(null);
  state.map.getSource("sim-area").setData(EMPTY);
  state.map.getSource("sim-rivals").setData(EMPTY);
  if (render) {
    restyleAll();
    drawPins();
    renderSheet();
  }
}

function bindSimulationControls() {
  const on = (selector, handler) => document.getElementById(selector)?.addEventListener("click", handler);
  on("sim-end", () => endSimulation());
  on("sim-end-bottom", () => endSimulation());
  for (const button of document.querySelectorAll("[data-sim-moment]")) {
    button.addEventListener("click", () => {
      state.sim.showAfter = button.dataset.simMoment === "after";
      drawSimulationMap();
      restyleAll();
      renderSheet({ keepScroll: true });
    });
  }
  const changeArea = (step) => {
    const [smallest, largest] = AREA_LIMITS_M2;
    state.sim.areaM2 = Math.min(largest, Math.max(smallest, state.sim.areaM2 + step));
    updateSimulation({ keepScroll: true });
  };
  on("area-smaller", () => changeArea(-AREA_STEP_M2));
  on("area-larger", () => changeArea(AREA_STEP_M2));
}

function simulationView() {
  const sim = state.sim, result = sim.result, name = tradeName(state.trade);
  const gu = guName(sim.dong), dongName = placeName(sim.dong);
  const header = `<div class="sheet-header">
      <button type="button" class="icon-button" id="sim-end" aria-label="${t("simEnd")}">‹</button>
      <div class="sheet-heading"><p class="eyebrow">${t("simEyebrow")}</p><h2 class="sheet-title">${t("simTitle", name)}</h2>
        <p class="sheet-subtitle">${escapeHtml(dongName)} · ${escapeHtml(gu)}</p></div>
    </div>`;
  if (!result) return `${header}<p class="muted">${t("loadingStores")}</p>`;
  const moment = `<div class="segmented sim-moment" role="group">
      <button type="button" data-sim-moment="before" class="${sim.showAfter ? "" : "on"}">${t("simBefore")}</button>
      <button type="button" data-sim-moment="after" class="${sim.showAfter ? "on" : ""}">${t("simAfter")}</button></div>
    <p class="chart-caption">${sim.showAfter ? t("simCaptionAfter", name, result.competition.nearbyAfter) : t("simCaptionBefore", name, result.competition.nearbyBefore)}</p>`;
  const parts = ["competition", "sales", "survival", "rent"].map((part) =>
    `<div class="score"><p class="score-label">${t("simParts")[part]}</p><p class="score-figure">${scoreFigure(part, result)}</p>${statusChip(result[part].status)}</div>`);
  return `${header}
    ${referenceNote()}
    <p class="sheet-lead">${t("simHowTo")}</p>
    ${moment}
    <div class="scorecard">${parts.join("")}</div>
    ${simCompetitionSection(result.competition, name)}
    ${simSalesSection(result.sales, name)}
    ${simSurvivalSection(result.survival)}
    ${simRentSection(result.rent)}
    <p class="fine-print">${t("simCaveat")}</p>
    <div class="actions"><button type="button" class="secondary-button" id="sim-end-bottom">${t("simEnd")}</button></div>`;
}

// The one figure under each part's status, so the four cells read as results, not empty slots (round 3)
function scoreFigure(part, result) {
  const figures = t("scoreFigures");
  if (part === "competition") return figures.competition(result.competition.nearbyAfter);
  if (part === "sales") {
    return result.sales.fromSeoul ? "–" : figures.sales((result.sales.likely / state.medians[state.trade].sales).toFixed(1));
  }
  if (part === "survival") return figures.survival(Math.round(result.survival.curve[3] * 100));
  return result.rent.monthly === null ? "–" : figures.rent(formatWon(result.rent.monthly));
}

function simCompetitionSection(competition, name) {
  const nearbyText = competition.nearbyBefore
    ? `${t("simNearby", name, competition.nearbyBefore, competition.nearbyAfter)} · ${t("simNearest", Math.round(competition.nearest.distance))}`
    : t("simNoneNearby", name);
  const gap = competition.gap;
  return `<section class="box">
      <h3 class="box-headline">${t("simCompetitionTitle")}</h3>
      <p class="sentence">${nearbyText}</p>
      ${gap ? `<p class="sentence">${t("simDongShops", name, gap.shopsBefore, gap.shopsAfter, Math.round(gap.expected))}</p>${gapMeter(gap)}
        ${chartHint(t("hintGapMeter", name, gap.shopsBefore, gap.shopsAfter, Math.round(gap.expected)))}
        <p class="sentence small">${statusLine(competition.status, t("simGapMove")[competition.status])}</p>` : ""}
    </section>`;
}

// Where the neighborhood sits on the gap scale, before (hollow) and after (pink) the new shop
function gapMeter(gap) {
  const lowest = -3, highest = 3;
  const position = (score) => ((Math.min(highest, Math.max(lowest, score)) - lowest) / (highest - lowest)) * 100;
  const bands = GAP_STYLE.map((style, index) => {
    const from = index === 0 ? lowest : GAP_STYLE[index - 1].upTo;
    const to = Math.min(style.upTo, highest);
    return `<span style="left:${position(from)}%;width:${position(to) - position(from)}%;background:${style.wash}"></span>`;
  });
  const labels = t("gapScale").map((label, index) => `<span style="left:${index * 50}%">${label}</span>`);
  return `<div class="gap-meter" role="img" aria-label="${escapeHtml(t("gapMeterLabel", gap.before.toFixed(1), gap.after.toFixed(1)))}">
      <div class="gap-track">${bands.join("")}
        <i class="marker before" style="left:${position(gap.before)}%"></i>
        <i class="marker after" style="left:${position(gap.after)}%"></i></div>
      <div class="gap-scale">${labels.join("")}</div>
      <p class="gap-keys"><span class="key-before"></span>${t("simBefore")} <span class="key-after"></span>${t("simAfter")}</p>
    </div>`;
}

function simSalesSection(sales, name) {
  const pattern = state.data.trade_patterns.find((p) => p.trade === state.trade).pattern;
  const seoul = state.medians[state.trade].sales;
  return `<section class="box">
      <h3 class="box-headline">${t("simSalesTitle")}</h3>
      ${sales.fromSeoul ? `<p class="sentence">${t("simSalesFromSeoul")}</p>` : `<p class="sentence">${t("simSalesRange", formatWon(sales.low), formatWon(sales.high))}</p>`}
      ${salesBar(sales, seoul)}
      ${chartHint(sales.fromSeoul ? t("hintSalesSeoul", formatWon(seoul)) : t("hintSalesRange", formatWon(sales.low), formatWon(sales.high)))}
      <p class="sentence">${statusLine(sales.status, t("simSalesLikely", formatWon(sales.likely), t("vsSeoul", sales.likely / seoul)))}</p>
      ${sales.fromSeoul ? "" : `<p class="fine-print">${t("simSalesExplain")} ${t("simLean")[pattern]} ${t("simNeighborsDrop", name, Math.max(1, Math.round(sales.neighborsDrop * 100)))}</p>`}
    </section>`;
}

// The sales range (green: money coming in), the likeliest point (pink: your shop) and the Seoul median (gray)
function salesBar(sales, seoul) {
  const top = Math.max(sales.high, seoul) * 1.15;
  const at = (value) => (value / top) * 100;
  // the Seoul label hangs off the side of its line that has room, so it never runs past the panel
  const seoulSide = at(seoul) > 60 ? "to-left" : at(seoul) < 40 ? "to-right" : "";
  return `<div class="range-bar" role="img" aria-label="${escapeHtml(t("simSalesRange", formatWon(sales.low), formatWon(sales.high)))}">
      <div class="range-track">
        <span class="range-fill" style="left:${at(sales.low)}%;width:${Math.max(1.5, at(sales.high) - at(sales.low))}%"></span>
        <i class="range-likely" style="left:${at(sales.likely)}%"></i>
        <i class="range-seoul ${seoulSide}" style="left:${at(seoul)}%"><span>${t("seoulMedianShort")}</span></i>
      </div>
      <div class="range-scale"><span>0</span><span>${formatWon(top)}</span></div>
    </div>`;
}

function simSurvivalSection(survival) {
  const percent = (share) => Math.round(share * 100);
  return `<section class="box">
      <h3 class="box-headline">${t("simSurvivalTitle")}</h3>
      <p class="sentence">${statusLine(survival.status, t("simSurvival", percent(survival.curve[1]), percent(survival.curve[3]), percent(survival.seoulCurve[3])))}</p>
      ${survivalChart(survival)}
      ${chartHint(t("hintSurvival", percent(survival.curve[3])))}
      <p class="fine-print">${survival.fromSeoul ? `${t("simSurvivalFromSeoul")} ` : ""}${t("simSurvivalExplain")}</p>
    </section>`;
}

// Two lines over 0-5 years: this spot (pink, your shop) and the Seoul median of the trade (gray, dashed).
// The lines stretch with the panel; every label is HTML, so text keeps its size (D69).
function survivalChart(survival) {
  const x = (year) => (year / SURVIVAL_YEARS) * 100;   // % of the plot's width
  const y = (share) => (1 - share) * 100;              // % of the plot's height
  const path = (curve) => curve.map((share, year) => `${year ? "L" : "M"}${x(year).toFixed(1)},${y(share).toFixed(1)}`).join("");
  const grid = [0, 0.5, 1].map((share) => `<line x1="0" x2="100" y1="${y(share)}" y2="${y(share)}" class="grid"/>`).join("");
  const shares = [0, 0.5, 1].map((share) => `<span style="top:${y(share)}%">${Math.round(share * 100)}%</span>`).join("");
  const years = Array.from({ length: SURVIVAL_YEARS + 1 }, (_, year) => `<span style="left:${x(year)}%">${t("yearShort", year)}</span>`).join("");
  const points = survival.curve.map((share, year) => `<i class="here-point" style="left:${x(year)}%;top:${y(share).toFixed(1)}%"
      title="${t("yearShort", year)}: ${Math.round(share * 100)}%"></i>`).join("");
  // Each line is named at its last point; when the two lines end close together the names are pushed apart
  const end = SURVIVAL_YEARS, labelGap = 14;   // % of the plot's height
  let hereY = y(survival.curve[end]), seoulY = y(survival.seoulCurve[end]);
  if (Math.abs(hereY - seoulY) < labelGap) {
    const middle = (hereY + seoulY) / 2, hereSide = hereY >= seoulY ? 1 : -1;
    hereY = middle + (hereSide * labelGap) / 2;
    seoulY = middle - (hereSide * labelGap) / 2;
  }
  return `<div class="chart survival" role="img" aria-label="${t("simSurvivalTitle")}">
      <div class="chart-shares">${shares}</div>
      <div class="chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${grid}
          <path d="${path(survival.seoulCurve)}" class="seoul-line"/><path d="${path(survival.curve)}" class="here-line"/></svg>
        ${points}
      </div>
      <div class="chart-ends">
        <span class="here-label" style="top:${hereY.toFixed(1)}%">${t("thisSpot")}</span>
        <span class="seoul-label" style="top:${seoulY.toFixed(1)}%">${t("seoulMedianShort")}</span>
      </div>
      <div class="chart-ticks">${years}</div>
    </div>`;
}

function simRentSection(rent) {
  const pyeong = Math.round(rent.areaM2 / SQUARE_METERS_PER_PYEONG);
  const stepper = `<div class="stepper">
      <button type="button" id="area-smaller" aria-label="${t("areaSmaller")}">−</button>
      <span>${t("simArea", rent.areaM2, pyeong)}</span>
      <button type="button" id="area-larger" aria-label="${t("areaLarger")}">+</button></div>`;
  const sentence = rent.monthly === null
    ? `<p class="sentence muted">${t("simRentUnknown")}</p>`
    : `<p class="sentence">${statusLine(rent.status, rent.share === null ? t("simRentOnly", formatWon(rent.monthly)) : t("simRent", formatWon(rent.monthly), Math.round(rent.share * 100)))}</p>`;
  return `<section class="box">
      <h3 class="box-headline">${t("simRentTitle")}</h3>
      ${stepper}${sentence}
      <p class="fine-print">${t("simAreaHint")} ${t("simRentRule")}</p>
    </section>`;
}

// The neighborhood a point is in (ray casting on our 424 shapes)
function dongAtLngLat(lng, lat) {
  return state.data.dongs.find((dong) => {
    const [west, south, east, north] = state.bboxes.get(dong.code);
    if (lng < west || lng > east || lat < south || lat > north) return false;
    const coordinates = dong.polygons.map((rings) => rings.map((ring) => ring.map(([pLat, pLng]) => [pLng, pLat])));
    return containsPoint({ type: "MultiPolygon", coordinates }, lng, lat);
  }) ?? null;
}

// 구 codes of the neighborhoods whose box touches a circle around a point
function guCodesNear(lng, lat, radiusM) {
  const dLat = radiusM / 110540, dLng = radiusM / (111320 * Math.cos(lat * (Math.PI / 180)));
  const codeOfGu = codeOfGuName();
  const codes = new Set();
  for (const dong of state.data.dongs) {
    const [west, south, east, north] = state.bboxes.get(dong.code);
    if (north >= lat - dLat && south <= lat + dLat && east >= lng - dLng && west <= lng + dLng) codes.add(codeOfGu[dong.gu]);
  }
  return [...codes];
}

function showToast(message) {
  const box = document.getElementById("error");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { box.hidden = true; }, 2500);
}

// ---------------------------------------------------------------------------
// Search: neighborhoods, road and lot addresses, building names
// ---------------------------------------------------------------------------
function loadAddresses() {
  if (!state.addresses) state.addresses = fetchJson("data/addresses.json").then(prepareAddresses);
  return state.addresses;
}

// One entry per building point, with its search text written without spaces ("강남구테헤란로152역삼동737강남파이낸스센터")
function prepareAddresses(columns) {
  const codeOfGu = codeOfGuName();
  return columns.road.map((road, i) => {
    const gu = columns.gu_names[columns.gu[i]];
    const jibun = columns.jibun[i], name = columns.name[i];
    return { gu, code: codeOfGu[gu], road, jibun, name, lat: 37 + columns.lat[i] / 1e5, lng: 126 + columns.lng[i] / 1e5,
             text: `${gu}${road}${jibun}${name}`.replace(/\s/g, ""), exact: [road, jibun, name, `${gu}${road}`].map((s) => s.replace(/\s/g, "")) };
  });
}

function findAddresses(addresses, query) {
  const found = [];
  for (const address of addresses) {
    if (address.text.includes(query)) found.push(address);
  }
  // exact addresses and building names first, then the rest in address order
  const exact = (a) => (a.exact.includes(query) ? 0 : 1);
  return found.sort((a, b) => exact(a) - exact(b)).slice(0, SEARCH_RESULTS.addresses);
}

function bindSearch() {
  const input = document.getElementById("search");
  const list = document.getElementById("search-results");
  let results = [];
  const choose = (result) => {
    input.value = "";
    list.hidden = true;
    input.blur();
    if (state.sim) endSimulation(false);
    showPanel();   // first, so an address's flight already leaves room for the panel (it unfolds after the flight otherwise)
    if (result.dong) selectDong(result.dong, { zoom: true });
    else goToAddress(result.address);
  };
  const render = (dongs, addresses, loading) => {
    results = [...dongs.map((dong) => ({ dong })), ...addresses.map((address) => ({ address }))];
    const items = [];
    if (dongs.length) {
      items.push(`<li class="group-title">${t("searchDongs")}</li>`);
      dongs.forEach((d, i) => items.push(`<li><button type="button" data-result="${i}">${escapeHtml(placeName(d))} <span>${escapeHtml(guName(d))}</span></button></li>`));
    }
    if (addresses.length) {
      items.push(`<li class="group-title">${t("searchAddresses")}</li>`);
      addresses.forEach((a, i) => items.push(`<li><button type="button" data-result="${dongs.length + i}">${escapeHtml(a.name || `${a.gu} ${a.road}`)}
        <span>${escapeHtml(a.name ? `${a.gu} ${a.road}` : a.jibun)}</span></button></li>`));
    }
    if (loading) items.push(`<li class="empty">${t("searchLoading")}</li>`);
    else if (!results.length) items.push(`<li class="empty">${t("noSearchResult")}</li>`);
    list.innerHTML = items.join("");
    list.hidden = false;
    for (const button of list.querySelectorAll("button")) button.addEventListener("click", () => choose(results[Number(button.dataset.result)]));
  };
  const search = async () => {
    const query = input.value.trim().replace(/\s/g, "");
    if (!query) {
      list.hidden = true;
      results = [];
      return;
    }
    // English names too: "yongdap" or "Yongdap-dong" finds 용답동, "gangnam" the dongs of 강남구
    const latin = query.toLowerCase().replace(/-/g, "");
    const latinName = (name) => name.toLowerCase().replace(/[\s-]/g, "");
    const dongs = state.data.dongs.filter((d) => d.dong.replace(/\s/g, "").includes(query)
      || (latin && (latinName(d.dong_en).includes(latin) || latinName(d.gu_en).includes(latin))))
      .slice(0, SEARCH_RESULTS.dongs);
    if (query.length < 2) {
      render(dongs, [], false);
      return;
    }
    const ready = state.addresses && (await Promise.race([state.addresses, Promise.resolve(null)]));
    if (!ready) render(dongs, [], true);
    const addresses = await loadAddresses();
    if (input.value.trim().replace(/\s/g, "") !== query) return;      // the user kept typing
    render(dongs, findAddresses(addresses, query), false);
  };
  let timer = null;
  input.addEventListener("focus", () => { loadAddresses(); });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(search, 120);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && results.length) choose(results[0]);
    if (event.key === "Escape") { input.value = ""; list.hidden = true; }
  });
}

// Fly to a searched building, then open its card and the neighborhood it belongs to
function goToAddress(address) {
  closeCard();
  state.map.flyTo({ center: [address.lng, address.lat], zoom: ADDRESS_ZOOM, offset: freeAreaOffset(), duration: 1200 });
  state.map.once("moveend", async () => {
    await refreshDots();
    await state.dots.load(address.code);
    const building = state.dots.buildingByPosition({ code: address.code, lat: address.lat, lng: address.lng });
    if (!building) return;
    const dong = state.data.dongs.find((d) => d.code === building.unit);
    if (dong && dong !== state.selected) selectDong(dong, { zoom: false });
    const show = () => openCard(building);
    if (state.map.areTilesLoaded()) show(); else state.map.once("idle", show);
  });
}

// ---------------------------------------------------------------------------
// Shareable link: #trade=카페&dong=11350595&lang=en, or #mode=customers&who=20_34&when=weekdayEvening
// ---------------------------------------------------------------------------
function readLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  const list = (key) => (params.get(key) ?? "").split(",").filter(Boolean);
  return { trade: params.get("trade"), dong: params.get("dong"), lang: params.get("lang"), also: list("also"),
           mode: params.get("mode"), who: list("who"), when: list("when"), narrow: list("narrow") };
}

// The customer map writes its choices instead of a trade; the shop idea's name stays on this screen
function writeLink() {
  const params = new URLSearchParams();
  if (state.customers) {
    params.set("mode", "customers");
    for (const list of ["who", "when", "narrow"]) {
      if (state.customers[list].length) params.set(list, state.customers[list].join(","));
    }
  } else if (state.trade) {
    params.set("trade", state.trade);
  }
  if (state.selected) params.set("dong", state.selected.code);
  if (state.extraKinds.length) params.set("also", state.extraKinds.map((kind) => state.meta.subtypes[kind]).join(","));
  if (getLanguage() !== "en") params.set("lang", getLanguage());
  history.replaceState(null, "", params.toString() ? `#${params}` : location.pathname);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function median(values) {
  const known = values.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
  if (!known.length) return null;
  const middle = Math.floor(known.length / 2);
  return known.length % 2 ? known[middle] : (known[middle - 1] + known[middle]) / 2;
}

function rankText(kpi, value) {
  if (value === null || value === undefined) return "";
  const values = state.data.dongs.map((d) => d.kpi[kpi]).filter((v) => v !== null);
  const higher = values.filter((v) => v > value).length / values.length;
  const lower = values.filter((v) => v < value).length / values.length;
  return higher <= 0.5 ? t("rankTop", Math.max(1, Math.round(higher * 100))) : t("rankBottom", Math.max(1, Math.round(lower * 100)));
}

// Where a value sits among Seoul's neighborhoods: the lower, middle or upper third
function band(values, value) {
  const known = values.filter(isKnown).sort((a, b) => a - b);
  const low = known[Math.floor(known.length / 3)], high = known[Math.floor((2 * known.length) / 3)];
  return value <= low ? "low" : value >= high ? "high" : "mid";
}

function isKnown(value) {
  return value !== null && value !== undefined;
}

function layerValueText(value) {
  switch (state.layer) {
    case "crowd":
    case "customers": return `${formatNumber(value)}${t("people")}`;
    case "close": return `${value.toFixed(1)}%`;
    case "rent": return `${value.toFixed(1)}k/㎡`;
    case "competition": return value.toFixed(1);
    case "tradeGap": return t("gapLegend")[GAP_STYLE.findIndex((s) => value <= s.upTo)];
    case "tradeSales": return formatWon(value);
    default: return "";
  }
}

// Busiest hour within business hours (at night most people present are residents at home)
function peakOf(hourly) {
  let best = { value: -1, hour: 0, dayType: "weekday" };
  for (const dayType of ["weekday", "weekend"]) {
    hourly[dayType].forEach((value, hour) => {
      const open = hour >= BUSINESS_HOURS[0] && hour <= BUSINESS_HOURS[1];
      if (open && value > best.value) best = { value, hour, dayType };
    });
  }
  return best;
}

// [[value, how often]] from most to least common
function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// Is a point inside a polygon outline? (ray casting on the outer rings)
function containsPoint(geometry, lng, lat) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.some(([outer]) => {
    let inside = false;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const [xi, yi] = outer[i], [xj, yj] = outer[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
