export type LatLng = { lat: number; lng: number }

/** Projection of a point onto a segment. `t` is unclamped; `point` is clamped. */
export type Projection = { t: number; point: LatLng; distanceKm: number }

const EARTH_RADIUS_KM = 6371
const KM_PER_DEGREE_LAT = 110.574
const KM_PER_DEGREE_LNG = 111.32

const toRad = (deg: number) => (deg * Math.PI) / 180

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Local equirectangular plane in km, centred on `origin`. Accurate enough over
 * the tens of kilometres a campus carpool covers, and it keeps the projection
 * math to plain vector arithmetic.
 */
function toPlane(point: LatLng, origin: LatLng): { x: number; y: number } {
  return {
    x: (point.lng - origin.lng) * KM_PER_DEGREE_LNG * Math.cos(toRad(origin.lat)),
    y: (point.lat - origin.lat) * KM_PER_DEGREE_LAT,
  }
}

export function projectOntoSegment(p: LatLng, a: LatLng, b: LatLng): Projection {
  const pa = toPlane(p, a)
  const ba = toPlane(b, a)
  const lengthSquared = ba.x ** 2 + ba.y ** 2

  if (lengthSquared === 0) {
    return { t: 0, point: a, distanceKm: haversineKm(p, a) }
  }

  const t = (pa.x * ba.x + pa.y * ba.y) / lengthSquared
  const clamped = Math.max(0, Math.min(1, t))
  const point: LatLng = {
    lat: a.lat + (b.lat - a.lat) * clamped,
    lng: a.lng + (b.lng - a.lng) * clamped,
  }

  return { t, point, distanceKm: haversineKm(p, point) }
}
