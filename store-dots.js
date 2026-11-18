// Shops on the map. The store register gives one position per building (its address point), so 554,092 stores sit
// on about 167,000 points.
// - From zoom 14, the chosen trade's shops show as red markers with their names, and the extra kinds picked under
//   "같이 볼 가게" as white markers (shop-markers.js). One marker per building per kind: "name +2" when it has more.
//   A building's markers stack downwards from its point, the chosen trade's on the point itself.
// - From zoom 15, the other shops are gray dots, one per building: its size grows with the stores inside, and tapping
//   it lists every store by floor. With a marked kind on the map, the dots fade so the markers stand out.
// Only the 구 files of the area on screen are loaded, and below zoom 15 only when some kind is marked.

import { COLORS } from "./colors.js";
import { metersBetween } from "./simulation.js";
import { kindIconKey, markerImageId } from "./shop-markers.js";

export const LABELS_MIN_ZOOM = 14;               // shop markers and names from the neighbourhood level
export const DOTS_MIN_ZOOM = 15;                 // gray dots only at street level
const SOURCE = "stores";
const LABEL_SOURCE = "shop-labels";
const SELECTED_SOURCE = "store-selected";
const EMPTY = { type: "FeatureCollection", features: [] };
const LARGEST_SIZE_STEP = 8;                     // dot size stops growing at 8² = 64 stores
const LABEL_TEXT_PX = 12;
const MARKER_STEP_PX = 34;                       // a building's markers stack this far apart: a 24 px marker clears a two-line name
// A marker and its name move down by the feature's "shift" (px); icon-offset is in px, text-offset in ems of the text
const ICON_SHIFT = ["interpolate", ["linear"], ["get", "shift"], 0, ["literal", [0, 0]], 100, ["literal", [0, 100]]];
const TEXT_SHIFT = ["interpolate", ["linear"], ["get", "shift"],
  0, ["literal", [1.1, 0]], 100, ["literal", [1.1, 100 / LABEL_TEXT_PX]]];

export class StoreDots {
  constructor(map, meta, { beforeId, onLoading } = {}) {
    this.map = map;
    this.meta = meta;
    this.onLoading = onLoading ?? (() => {});
    this.files = new Map();                      // 구 code -> { columns, buildings: [{ lat, lng, rows }] }
    this.pending = new Map();                    // 구 code -> fetch promise
    this.shownCodes = [];
    this.drawn = [];                             // the buildings on the map: { code, index }; features point here
    this.visibleGroups = new Set(meta.groups.map((_, index) => index).filter((index) => meta.groups[index].key !== "other"));
    this.mainTrade = null;
    this.competitorSubtypes = new Set();         // SEMAS subtypes of the chosen trade
    this.extraSubtypes = [];                     // "같이 볼 가게": extra SEMAS subtypes, in the order picked
    this.addLayers(beforeId);
  }

  addLayers(beforeId) {
    const sizeStep = ["min", ["sqrt", ["get", "count"]], LARGEST_SIZE_STEP];
    this.map.addSource(SOURCE, { type: "geojson", data: EMPTY });
    this.map.addSource(LABEL_SOURCE, { type: "geojson", data: EMPTY });
    this.map.addSource(SELECTED_SOURCE, { type: "geojson", data: EMPTY });
    this.map.addLayer({
      id: "store-dots", type: "circle", source: SOURCE, minzoom: DOTS_MIN_ZOOM,
      layout: { "circle-sort-key": ["get", "rank"] },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"],
          15, ["+", ["case", ["get", "dim"], 1.6, 2.4], ["*", 0.5, sizeStep]],
          18, ["+", ["case", ["get", "dim"], 3, 5], ["*", 1.5, sizeStep]]],
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["get", "dim"], 0.6, 0.95],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 15, 0.8, 18, 1.6],
      },
    }, beforeId);
    this.map.addLayer({
      id: "store-counts", type: "symbol", source: SOURCE, minzoom: 16.5,
      filter: ["all", [">", ["get", "count"], 1], ["!", ["get", "dim"]]],
      layout: { "text-field": ["to-string", ["get", "count"]], "text-font": ["Noto Sans Medium"], "text-size": 10,
                "text-allow-overlap": true, "text-ignore-placement": true },
      paint: { "text-color": "#ffffff" },
    }, beforeId);
    this.map.addLayer({
      id: "store-selected", type: "circle", source: SELECTED_SOURCE, minzoom: LABELS_MIN_ZOOM,
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, ["case", ["get", "marker"], 15, 7], 18, 16],
               "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": COLORS.ink, "circle-stroke-width": 2.5 },
    }, beforeId);
    // On top of the base map's labels, so shop names win against street names; the chosen trade sorts first
    this.map.addLayer({
      id: "shop-labels", type: "symbol", source: LABEL_SOURCE, minzoom: LABELS_MIN_ZOOM,
      layout: {
        "icon-image": ["get", "icon"], "icon-offset": ICON_SHIFT,
        "text-field": ["get", "label"], "text-font": ["Noto Sans Medium"], "text-size": LABEL_TEXT_PX,
        "text-anchor": "left", "text-offset": TEXT_SHIFT, "text-max-width": 8,
        "text-optional": true,                   // in a crowded street the marker stays and the name gives way
        "symbol-sort-key": ["get", "order"],
      },
      paint: { "text-color": COLORS.ink, "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
    // While simulating, the chosen trade's shops outside the 5-minute walk: a small hollow ring each (setWalkArea)
    this.map.addLayer({
      id: "shop-outside", type: "circle", source: LABEL_SOURCE, minzoom: LABELS_MIN_ZOOM, layout: { visibility: "none" },
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.5, 18, 3.5], "circle-color": "#ffffff",
               "circle-stroke-color": COLORS.risk, "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.7 },
    }, beforeId);
  }

  // The simulation's walk (a GeoJSON polygon; null ends it). Round 4: about 120 equal markers in and out of the walk
  // read as noise, so the chosen trade keeps its markers only inside; outside they shrink to hollow rings.
  setWalkArea(polygon) {
    const mainTrade = ["==", ["get", "order"], 0];
    this.map.setFilter("shop-labels", polygon ? ["any", ["!", mainTrade], ["within", polygon]] : null);
    this.map.setFilter("shop-outside", polygon ? ["all", mainTrade, ["!", ["within", polygon]]] : null);
    this.map.setLayoutProperty("shop-outside", "visibility", polygon ? "visible" : "none");
  }

  get active() {
    return this.map.getZoom() >= DOTS_MIN_ZOOM;
  }

  get streetLevel() {
    return this.map.getZoom() >= LABELS_MIN_ZOOM;
  }

  // Whether the area on screen needs its 구 files: for the gray dots, or for the markers of a chosen kind
  get needsFiles() {
    const marked = this.competitorSubtypes.size > 0 || this.extraSubtypes.length > 0;
    return this.active || (this.streetLevel && marked);
  }

  // Shop names only from this zoom (null: at every zoom the markers show). The simulation sets 17: in the walk circle
  // dozens of names piled onto "내 카페" (round 3), and its markers and their dots already count the rivals.
  setNamesFromZoom(zoom) {
    const label = ["get", "label"];
    this.map.setLayoutProperty("shop-labels", "text-field", zoom === null ? label : ["step", ["zoom"], "", zoom, label]);
  }

  setVisibleGroups(groups) {
    this.visibleGroups = new Set(groups);
    this.draw();
  }

  setMainTrade(trade) {
    this.mainTrade = trade || null;
    this.competitorSubtypes = new Set(this.mainTrade ? this.meta.trade_subtypes[this.mainTrade] : []);
    this.draw();
  }

  setExtraKinds(subtypes) {
    this.extraSubtypes = [...subtypes];
    this.draw();
  }

  isMarked(subtype) {
    return this.competitorSubtypes.has(subtype) || this.extraSubtypes.includes(subtype);
  }

  // Load the 구 files that overlap the screen, then draw their buildings
  async refresh(guCodesOnScreen) {
    if (!this.needsFiles) return;
    const missing = guCodesOnScreen.filter((code) => !this.files.has(code));
    if (missing.length) {
      this.onLoading(true);
      await Promise.all(missing.map((code) => this.load(code)));
      this.onLoading(false);
    }
    const same = guCodesOnScreen.length === this.shownCodes.length && guCodesOnScreen.every((c) => this.shownCodes.includes(c));
    if (!same || missing.length) {
      this.shownCodes = guCodesOnScreen;
      this.draw();
    }
  }

  load(code) {
    if (!this.pending.has(code)) {
      const request = fetch(this.meta.files[code].file).then((response) => response.json()).then((columns) => {
        this.files.set(code, { columns, buildings: groupByBuilding(columns) });
      });
      this.pending.set(code, request);
    }
    return this.pending.get(code);
  }

  // The kinds shown with markers and names: the chosen trade first, so it is placed first and wins collisions
  markedKinds() {
    const kinds = [];
    if (this.mainTrade) kinds.push({ subtypes: this.competitorSubtypes, icon: markerImageId("main", this.mainTrade), order: 0 });
    this.extraSubtypes.forEach((subtype, position) => kinds.push({
      subtypes: new Set([subtype]), icon: markerImageId("extra", kindIconKey(subtype, this.meta)), order: 1 + position,
    }));
    return kinds;
  }

  // Per building: one marker per marked kind it holds, and one gray dot for its other stores of a visible group.
  // Every feature's "building" property indexes this.drawn.
  draw() {
    this.drawn = [];
    const dots = [], labels = [];
    const kinds = this.markedKinds();
    const faded = kinds.length > 0;
    for (const code of this.shownCodes) {
      const file = this.files.get(code);
      if (!file) continue;
      const { group, sub, name } = file.columns;
      file.buildings.forEach((building, index) => {
        const id = this.drawn.length;
        const geometry = { type: "Point", coordinates: [building.lng, building.lat] };
        let markers = 0;                         // on one point, a second marker would collide with the first and vanish
        for (const kind of kinds) {
          const rows = building.rows.filter((row) => kind.subtypes.has(sub[row]));
          if (!rows.length) continue;
          labels.push({ type: "Feature", geometry, properties: {
            building: id, icon: kind.icon, order: kind.order, label: shopLabel(rows.map((row) => name[row])),
            shift: markers * MARKER_STEP_PX } });
          markers += 1;
        }
        const others = building.rows.filter((row) => !this.isMarked(sub[row]) && this.visibleGroups.has(group[row]));
        if (others.length) {
          dots.push({ type: "Feature", id, geometry, properties: {
            building: id, count: others.length, color: faded ? COLORS.storeMuted : COLORS.store, dim: faded, rank: others.length } });
        }
        if (markers || others.length) this.drawn.push({ code, index });
      });
    }
    this.map.getSource(SOURCE).setData({ type: "FeatureCollection", features: dots });
    this.map.getSource(LABEL_SOURCE).setData({ type: "FeatureCollection", features: labels });
  }

  // The building of a feature on the "store-dots" or "shop-labels" layer (its "building" property)
  buildingAt(building) {
    const { code, index } = this.drawn[building];
    return this.describe(code, index);
  }

  // The building at a position, also when nothing of it is drawn (e.g. a searched address with only hidden kinds of store)
  buildingByPosition({ code, lat, lng }) {
    const file = this.files.get(code);
    if (!file) return null;
    const index = file.buildings.findIndex((b) => Math.abs(b.lat - lat) < 1e-6 && Math.abs(b.lng - lng) < 1e-6);
    return index === -1 ? null : this.describe(code, index);
  }

  // Everything the building card needs
  describe(code, index) {
    const { columns, buildings } = this.files.get(code);
    const building = buildings[index];
    const stores = building.rows.map((row) => ({
      name: columns.name[row], group: columns.group[row], subtype: this.meta.subtypes[columns.sub[row]],
      floor: columns.floor[row], competitor: this.competitorSubtypes.has(columns.sub[row]),
      extra: this.extraSubtypes.includes(columns.sub[row]),
      visible: this.isMarked(columns.sub[row]) || this.visibleGroups.has(columns.group[row]),
    }));
    // the building's most common name; one-letter entries ("제", "B") are typing slips in the register
    const names = building.rows.map((row) => columns.bldg[row]).filter((n) => n >= 0)
      .map((n) => columns.buildings[n]).filter((name) => name.length >= 2);
    return {
      code, lat: building.lat, lng: building.lng, stores,
      name: names.length ? mostCommon(names) : "",
      address: `${this.meta.files[code].gu} ${columns.addr[building.rows[0]]}`, unit: columns.unit[building.rows[0]],
    };
  }

  // Where a neighborhood's stores are: the median store position, as [lng, lat] (its shape's middle can be a park)
  async storeCenter(code, unit) {
    await this.load(code);
    const { lat, lng, unit: units } = this.files.get(code).columns;
    const rows = units.flatMap((u, row) => (u === unit ? [row] : []));
    if (!rows.length) return null;
    const middle = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    return [middle(rows.map((row) => lng[row])), middle(rows.map((row) => lat[row]))];
  }

  // Stores of the chosen trade within a distance of a point, nearest first (from the 구 files already loaded)
  competitorsNear(lng, lat, radiusM) {
    const found = [];
    for (const { columns } of this.files.values()) {
      columns.sub.forEach((sub, row) => {
        if (!this.competitorSubtypes.has(sub)) return;
        const distance = metersBetween(lng, lat, columns.lng[row], columns.lat[row]);
        if (distance <= radiusM) found.push({ lng: columns.lng[row], lat: columns.lat[row], name: columns.name[row], distance });
      });
    }
    return found.sort((a, b) => a.distance - b.distance);
  }

  // A ring around the building whose card is open (larger around a marker than around a dot)
  select(building) {
    const marker = building?.stores.some((store) => store.competitor || store.extra) ?? false;
    const features = building
      ? [{ type: "Feature", geometry: { type: "Point", coordinates: [building.lng, building.lat] }, properties: { marker } }]
      : [];
    this.map.getSource(SELECTED_SOURCE).setData({ type: "FeatureCollection", features });
  }
}

// A marker's name: the first shop, and how many more of the kind the building holds
export function shopLabel(names) {
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
}

function groupByBuilding(columns) {
  const byPoint = new Map();
  columns.lat.forEach((lat, row) => {
    const key = `${lat},${columns.lng[row]}`;
    if (!byPoint.has(key)) byPoint.set(key, { lat, lng: columns.lng[row], rows: [] });
    byPoint.get(key).rows.push(row);
  });
  return [...byPoint.values()];
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
