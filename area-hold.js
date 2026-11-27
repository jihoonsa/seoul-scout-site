// The area held in view (top bar design 5.4): the camera that fits an opened area to the map's box, and the limits
// that hold it there. Pure camera math, apart from reading the map's box and asking MapLibre for the fit.

// Room left on the map's box for the controls over it: the zoom hint at the top, the zoom buttons and "서울 전체" on the right
export const AREA_FIT_PADDING = { top: 56, right: 80, bottom: 24, left: 24 };
// The pan limit is the fitted view grown by this share on each side, so a corner under the shop key can be dragged into view
export const HOLD_GROW = 0.25;

const TILE_SIZE = 512;   // MapLibre's world is 512 px wide at zoom 0

// The [west, south, east, north] a camera at this centre and zoom shows in a box of width x height px (Web Mercator)
export function viewBounds([lng, lat], zoom, width, height) {
  const world = TILE_SIZE * 2 ** zoom;
  const x = (lng + 180) / 360 * world;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * world;
  const [west, north] = pixelToLngLat(x - width / 2, y - height / 2, world);
  const [east, south] = pixelToLngLat(x + width / 2, y + height / 2, world);
  return [west, south, east, north];
}

function pixelToLngLat(x, y, world) {
  const lng = x / world * 360 - 180;
  const lat = 360 / Math.PI * Math.atan(Math.exp(Math.PI * (1 - 2 * y / world))) - 90;
  return [lng, lat];
}

// The box widened on each side by `share` of its own width (east and west) or height (north and south)
export function grownBounds([west, south, east, north], share) {
  const growX = (east - west) * share;
  const growY = (north - south) * share;
  return [west - growX, south - growY, east + growX, north + growY];
}

// The fit of an area's [west, south, east, north] box to the map's box, with no zoom cap below the map's own maximum,
// and the pan limit that holds it: the fitted view, grown by HOLD_GROW
export function holdCamera(map, [west, south, east, north]) {
  const fit = map.cameraForBounds([[west, south], [east, north]], { padding: AREA_FIT_PADDING, maxZoom: map.getMaxZoom() });
  const center = [fit.center.lng, fit.center.lat];
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  return { center, zoom: fit.zoom, bounds: grownBounds(viewBounds(center, fit.zoom, width, height), HOLD_GROW) };
}
