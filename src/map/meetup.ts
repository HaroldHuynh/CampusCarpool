import { haversineKm, type LatLng } from './geometry'

export type PlaceCategory = 'transit' | 'public' | 'campus' | 'other'

export type Place = {
  id: string
  label: string
  lat: number
  lng: number
  category: PlaceCategory
  /** Short forms people actually type: "SLO", "SF", "LA". */
  aliases?: string[]
}

export type Meetup = {
  point: LatLng
  /** Null when no suitable named place was in range; present it as approximate. */
  label: string | null
  walkKm: number
  walkMinutes: number
}

export type Payoff = {
  walkMinutes: number
  /** Null when the estimated saving is below MIN_SAVINGS_MINUTES. */
  minutesSaved: number | null
}

export const WALK_KMH = 5
export const LOCAL_KMH = 30
export const PATH_FACTOR = 1.3
export const MIN_SAVINGS_MINUTES = 5
export const MEETUP_RADIUS_KM = 1.2

const CATEGORY_RANK: Record<PlaceCategory, number> = {
  transit: 0,
  public: 1,
  campus: 2,
  other: 3,
}

/** Distances are straight-line, so scale them toward a real-world path. */
function minutesAt(speedKmh: number, straightKm: number): number {
  return ((straightKm * PATH_FACTOR) / speedKmh) * 60
}

export function chooseMeetup(
  riderOrigin: LatLng,
  projection: LatLng,
  places: Place[],
): Meetup {
  let best: Place | null = null
  let bestKm = Infinity

  for (const place of places) {
    const km = haversineKm(projection, place)
    if (km > MEETUP_RADIUS_KM) continue

    const clearlyCloser = km < bestKm - 0.05
    const tiedButBetterKind =
      Math.abs(km - bestKm) <= 0.05 &&
      best !== null &&
      CATEGORY_RANK[place.category] < CATEGORY_RANK[best.category]

    if (best === null || clearlyCloser || tiedButBetterKind) {
      best = place
      bestKm = km
    }
  }

  const point: LatLng = best ? { lat: best.lat, lng: best.lng } : projection
  const walkKm = haversineKm(riderOrigin, point)

  return {
    point,
    label: best ? best.label : null,
    walkKm,
    walkMinutes: Math.round(minutesAt(WALK_KMH, walkKm)),
  }
}

/**
 * Without a shared meetup the rider has to reach the driver's actual origin,
 * because that is how endpoint-matched ride boards work. The saving is the
 * difference between making that trip and walking to the meetup point.
 */
export function computePayoff(
  riderOrigin: LatLng,
  driverOrigin: LatLng,
  meetup: Meetup,
): Payoff {
  const toDriverMinutes = minutesAt(LOCAL_KMH, haversineKm(riderOrigin, driverOrigin))
  const saved = Math.round(toDriverMinutes - minutesAt(WALK_KMH, meetup.walkKm))

  return {
    walkMinutes: meetup.walkMinutes,
    minutesSaved: saved >= MIN_SAVINGS_MINUTES ? saved : null,
  }
}
