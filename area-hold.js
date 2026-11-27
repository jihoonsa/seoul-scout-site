// The area held in view (top bar design 5.4): the camera that fits an opened area to the map's box, and the limits
// that hold it there. Pure camera math, apart from reading the map's box and asking MapLibre for the fit.

// Room left on the map's box for the controls over it: the zoom hint at the top, the zoom buttons and "서울 전체" on the
// right. Opposite sides are equal, so the fitted area sits in the middle of the map, not beside it.
export const AREA_FIT_PADDING = { top: 56, right: 80, bottom: 56, left: 80 };
// The pan limit is the fitted view grown by this share on each side, so a corner under the shop key can be dragged into view
export const HOLD_GROW = 0.25;

const TILE_SIZE = 512;   // MapLibre's world is 512 px wide at zoom 0

// The [west, south, east, north] a camera at this centre and zoom shows in a box of width x height px (Web Mercator)
export function viewBounds([lng, lat], zoom, width, height) {
  const world = TILE_SIZE * 2 ** zoom;
  const [x, y] = lngLatToPixel(lng, lat, world);
  const [west, north] = pixelToLngLat(x - width / 2, y - height / 2, world);
  const [east, south] = pixelToLngLat(x + width / 2, y + height / 2, world);
  return [west, south, east, north];
}

// The [west, south, east, north] box centred on the area's centre of mass that still holds the whole area (Web
// Mercator). Fitting it puts the area itself in the middle of the map; its bounding box would put a thin arm's end
// there instead. `polygons` are the area's polygons of rings of [lat, lng] points, as in dongs.json.
export function centredBounds(polygons) {
  let twiceArea = 0, sumX = 0, sumY = 0;
  const xs = [], ys = [];
  for (const ring of polygons.flat(1)) {
    const points = ring.map(([lat, lng]) => lngLatToPixel(lng, lat, 1));
    points.forEach(([x0, y0], index) => {
      const [x1, y1] = points[(index + 1) % points.length];
      const cross = x0 * y1 - x1 * y0;   // the shoelace formula: each edge's share of the area and its centre
      twiceArea += cross;
      sumX += (x0 + x1) * cross;
      sumY += (y0 + y1) * cross;
      xs.push(x0);
      ys.push(y0);
    });
  }
  const centreX = sumX / (3 * twiceArea), centreY = sumY / (3 * twiceArea);
  const halfX = Math.max(centreX - Math.min(...xs), Math.max(...xs) - centreX);
  const halfY = Math.max(centreY - Math.min(...ys), Math.max(...ys) - centreY);
  const [west, north] = pixelToLngLat(centreX - halfX, centreY - halfY, 1);
  const [east, south] = pixelToLngLat(centreX + halfX, centreY + halfY, 1);
  return [west, south, east, north];
}

function lngLatToPixel(lng, lat, world) {
  return [(lng + 180) / 360 * world, (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * world];
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

// The fit of an area's [west, south, east, north] box (centredBounds) to the map's box, with no zoom cap below the map's own maximum,
// and the pan limit that holds it: the fitted view, grown by HOLD_GROW
export function holdCamera(map, [west, south, east, north]) {
  const fit = map.cameraForBounds([[west, south], [east, north]], { padding: AREA_FIT_PADDING, maxZoom: map.getMaxZoom() });
  const center = [fit.center.lng, fit.center.lat];
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  return { center, zoom: fit.zoom, bounds: grownBounds(viewBounds(center, fit.zoom, width, height), HOLD_GROW) };
}
