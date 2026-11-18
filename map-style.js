// Seoul Scout base map: OpenStreetMap data (cut by build_basemap.py into data/seoul.pmtiles), drawn in our own calm colors.
// Only what helps a founder find their way is drawn: water, parks, roads, rail, buildings, stations and a few landmarks.
// Our own layers go in between (see app.js): neighborhood tints under the roads, outlines and store dots under the labels.

export const TINT_BEFORE = "water";            // neighborhood tints sit under the water, every road and building (round 5: a tint over the river's hatch read as brown stripes)
export const OUTLINE_BEFORE = "label-water";   // neighborhood outlines sit under every label
export const DOTS_BEFORE = "stations-dot";     // store dots sit under the station labels

// The ink atlas (D75, design/DESIGN.md): white land on a neutral ground, water in a fine hatch, no yellow roads
const COLORS = {
  outside: "#f4f5f3", land: "#ffffff", water: "#e1e9ec", waterLine: "#86a0ab", waterText: "#4f6c77", green: "#eef2ea",
  road: "#ffffff", roadCasing: "#e4e5e1", highway: "#ffffff", highwayCasing: "#cfd1cc", rail: "#c9cbc6",
  building: "#f1f2ef", buildingLine: "#e3e4e0", text: "#6a6d71", textStrong: "#3a3c3f", halo: "#ffffff",
};
export const WATER_HATCH = "water-hatch";

// The water's fine horizontal hatch, drawn once into an image the map repeats (2x for sharp screens)
export function waterHatchImage() {
  const size = 10, data = new Uint8Array(size * size * 4);
  const paint = (row, [r, g, b]) => {
    for (let x = 0; x < size; x++) data.set([r, g, b, 255], (row * size + x) * 4);
  };
  for (let row = 0; row < size; row++) paint(row, row === 4 || row === 5 ? [0xa9, 0xbd, 0xc5] : [0xe1, 0xe9, 0xec]);
  return { width: size, height: size, data };
}
const GREEN_KINDS = ["park", "wood", "forest", "grass", "garden", "cemetery", "golf_course", "nature_reserve",
  "meadow", "scrub", "recreation_ground", "village_green", "allotments", "pitch", "playground", "national_park"];
const LANDMARK_KINDS = ["university", "college", "park", "mall", "hospital"];
const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Medium"];

// Korean shows the Korean name; English shows the English name where OpenStreetMap has one
export function nameField(language) {
  return language === "en"
    ? ["coalesce", ["get", "name:en"], ["get", "name"]]
    : ["coalesce", ["get", "name:ko"], ["get", "name"]];
}

// "용산" -> "용산역" in Korean; the English name stays as it is
function stationName(language) {
  if (language === "en") return nameField("en");
  const name = nameField("ko");
  return ["case", ["==", ["slice", name, ["-", ["length", name], 1]], "역"], name, ["concat", name, "역"]];
}

// Layers whose text follows the language toggle, and how to write their text
export function labelTexts(language) {
  return {
    "label-water": nameField(language), "label-water-line": nameField(language), "label-roads": nameField(language),
    "label-stations": stationName(language), "label-landmarks": nameField(language), "label-cities": nameField(language),
  };
}

const width = (stops) => ["interpolate", ["exponential", 1.6], ["zoom"], ...stops];
const notTunnel = ["!", ["to-boolean", ["get", "is_tunnel"]]];

export function baseStyle(language, basemapUrl) {
  const texts = labelTexts(language);
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      basemap: { type: "vector", url: basemapUrl, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>' },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": COLORS.outside } },
      { id: "earth", type: "fill", source: "basemap", "source-layer": "earth", paint: { "fill-color": COLORS.land } },
      { id: "landcover", type: "fill", source: "basemap", "source-layer": "landcover", maxzoom: 8,
        filter: ["in", ["get", "kind"], ["literal", ["forest", "grassland", "scrub"]]], paint: { "fill-color": COLORS.green, "fill-opacity": 0.5 } },
      { id: "landuse-green", type: "fill", source: "basemap", "source-layer": "landuse",
        filter: ["in", ["get", "kind"], ["literal", GREEN_KINDS]], paint: { "fill-color": COLORS.green } },
      { id: "water", type: "fill", source: "basemap", "source-layer": "water",
        filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-pattern": WATER_HATCH } },
      { id: "water-edge", type: "line", source: "basemap", "source-layer": "water",
        filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": COLORS.waterLine, "line-width": 0.7 } },
      { id: "water-line", type: "line", source: "basemap", "source-layer": "water", minzoom: 12,
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["in", ["get", "kind"], ["literal", ["river", "stream", "canal"]]]],
        paint: { "line-color": COLORS.water, "line-width": width([12, 0.8, 18, 6]) } },

      { id: "roads-path", type: "line", source: "basemap", "source-layer": "roads", minzoom: 15,
        filter: ["all", ["==", ["get", "kind"], "path"], notTunnel],
        paint: { "line-color": COLORS.road, "line-opacity": 0.85, "line-width": width([15, 0.6, 19, 3]) } },
      { id: "roads-minor-casing", type: "line", source: "basemap", "source-layer": "roads", minzoom: 14,
        filter: ["all", ["in", ["get", "kind"], ["literal", ["minor_road", "other"]]], notTunnel],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": COLORS.roadCasing, "line-width": width([14, 2, 19, 18]) } },
      { id: "roads-minor", type: "line", source: "basemap", "source-layer": "roads", minzoom: 12,
        filter: ["all", ["in", ["get", "kind"], ["literal", ["minor_road", "other"]]], notTunnel],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": COLORS.road, "line-width": width([12, 0.4, 14, 1.2, 19, 15]) } },
      { id: "rail", type: "line", source: "basemap", "source-layer": "roads", minzoom: 11,
        filter: ["all", ["==", ["get", "kind"], "rail"], ["!=", ["get", "kind_detail"], "subway"], notTunnel],
        paint: { "line-color": COLORS.rail, "line-width": width([11, 0.6, 18, 2.5]) } },
      { id: "roads-major-casing", type: "line", source: "basemap", "source-layer": "roads", minzoom: 12,
        filter: ["all", ["==", ["get", "kind"], "major_road"], notTunnel],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": COLORS.roadCasing, "line-width": width([12, 1.6, 19, 30]) } },
      { id: "roads-major", type: "line", source: "basemap", "source-layer": "roads", minzoom: 8,
        filter: ["all", ["==", ["get", "kind"], "major_road"], notTunnel],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": COLORS.road, "line-width": width([8, 0.4, 12, 1, 19, 26]) } },
      { id: "roads-highway-casing", type: "line", source: "basemap", "source-layer": "roads", minzoom: 10,
        filter: ["all", ["==", ["get", "kind"], "highway"], notTunnel],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": COLORS.highwayCasing, "line-width": width([10, 1.6, 19, 34]) } },
      { id: "roads-highway", type: "line", source: "basemap", "source-layer": "roads", minzoom: 6,
        filter: ["all", ["==", ["get", "kind"], "highway"], notTunnel],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": COLORS.highway, "line-width": width([6, 0.5, 10, 1.1, 19, 30]) } },
      { id: "buildings", type: "fill", source: "basemap", "source-layer": "buildings", minzoom: 14,
        paint: { "fill-color": COLORS.building, "fill-outline-color": COLORS.buildingLine,
                 "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1] } },

      { id: "label-water", type: "symbol", source: "basemap", "source-layer": "water", minzoom: 12,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["has", "name"]],
        layout: { "text-field": texts["label-water"], "text-font": FONT, "text-size": 12, "text-max-width": 8 },
        paint: { "text-color": COLORS.waterText, "text-halo-color": COLORS.water, "text-halo-width": 1 } },
      { id: "label-water-line", type: "symbol", source: "basemap", "source-layer": "water", minzoom: 11,
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "kind"], "river"], ["has", "name"]],
        layout: { "symbol-placement": "line", "text-field": texts["label-water-line"], "text-font": FONT,
                  "text-size": ["interpolate", ["linear"], ["zoom"], 11, 12, 16, 15], "text-letter-spacing": 0.2, "symbol-spacing": 500 },
        paint: { "text-color": COLORS.waterText, "text-halo-color": COLORS.water, "text-halo-width": 1 } },
      { id: "label-roads", type: "symbol", source: "basemap", "source-layer": "roads", minzoom: 14,
        filter: ["all", ["has", "name"], ["any", ["in", ["get", "kind"], ["literal", ["highway", "major_road"]]],
                                          [">=", ["zoom"], 16.5]]],
        layout: { "symbol-placement": "line", "text-field": texts["label-roads"], "text-font": FONT,
                  "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10.5, 18, 13], "symbol-spacing": 350 },
        paint: { "text-color": COLORS.text, "text-halo-color": COLORS.halo, "text-halo-width": 1.4 } },
      { id: "label-cities", type: "symbol", source: "basemap", "source-layer": "places", minzoom: 8, maxzoom: 12.5,
        filter: ["all", ["==", ["get", "kind"], "locality"], ["==", ["get", "kind_detail"], "city"], ["!=", ["get", "name"], "서울특별시"]],
        layout: { "text-field": texts["label-cities"], "text-font": FONT, "text-size": 12 },
        paint: { "text-color": "#8f928e", "text-halo-color": COLORS.halo, "text-halo-width": 1.2 } },
      { id: "stations-dot", type: "circle", source: "basemap", "source-layer": "pois", minzoom: 13,
        filter: ["==", ["get", "kind"], "station"],
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 2.5, 17, 4.5], "circle-color": COLORS.halo,
                 "circle-stroke-color": COLORS.textStrong, "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 13, 1.4, 17, 2.2] } },
      { id: "label-stations", type: "symbol", source: "basemap", "source-layer": "pois", minzoom: 13,
        filter: ["==", ["get", "kind"], "station"],
        layout: { "text-field": texts["label-stations"], "text-font": FONT_BOLD,
                  "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 17, 13.5],
                  "text-anchor": "top", "text-offset": [0, 0.7], "text-max-width": 7 },
        paint: { "text-color": COLORS.textStrong, "text-halo-color": COLORS.halo, "text-halo-width": 1.6 } },
      { id: "label-landmarks", type: "symbol", source: "basemap", "source-layer": "pois", minzoom: 15.5,
        filter: ["all", ["in", ["get", "kind"], ["literal", LANDMARK_KINDS]], ["has", "name"]],
        layout: { "text-field": texts["label-landmarks"], "text-font": FONT, "text-size": 11, "text-max-width": 7 },
        paint: { "text-color": "#6a6d71", "text-halo-color": COLORS.halo, "text-halo-width": 1.4 } },
    ],
  };
}
