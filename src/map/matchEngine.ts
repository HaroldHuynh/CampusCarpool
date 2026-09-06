import { haversineKm, projectOntoSegment, type LatLng, type Projection } from './geometry'

export type RideCandidate = {
  id: string
  origin: LatLng
  destination: LatLng
  departureAt: string
  seatsAvailable: number
  isMine: boolean
  hasReserved: boolean
}

export type Trip = { origin: LatLng; destination: LatLng; departAt: string }

export type MatchOptions = { windowMinutes?: number; maxCorridorKm?: number }

export type Match = {
  rideId: string
  routeMatch: number
  score: number
  timeDeltaMinutes: number
  board: Projection
  alight: Projection
}

const DEFAULT_WINDOW_MINUTES = 90
const DEFAULT_CORRIDOR_KM = 5
const SEAT_HEADROOM_CAP = 4
/** Below this, a ride shares too little of the trip to be worth offering. */
const MIN_ROUTE_MATCH = 0.15

export function rankMatches(
  trip: Trip,
  rides: RideCandidate[],
  options: MatchOptions = {},
): Match[] {
  const windowMinutes = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES
  const maxCorridorKm = options.maxCorridorKm ?? DEFAULT_CORRIDOR_KM
  const departAt = new Date(trip.departAt).getTime()
  const tripKm = haversineKm(trip.origin, trip.destination)

  if (!Number.isFinite(departAt) || tripKm === 0) {
    return []
  }

  const matches: Match[] = []

  for (const ride of rides) {
    if (ride.seatsAvailable < 1 || ride.isMine || ride.hasReserved) continue

    const rideAt = new Date(ride.departureAt).getTime()
    if (!Number.isFinite(rideAt)) continue

    const timeDeltaMinutes = Math.round((rideAt - departAt) / 60000)
    if (Math.abs(timeDeltaMinutes) > windowMinutes) continue

    const board = projectOntoSegment(trip.origin, ride.origin, ride.destination)
    const alight = projectOntoSegment(trip.destination, ride.origin, ride.destination)

    // Same direction along the driver's route.
    if (alight.t <= board.t) continue

    // The corridor limit applies to boarding only: that is the distance the
    // rider actually has to cover to meet the driver. A driver who drops the
    // rider short of their destination is still a real partial match, and the
    // route-match fraction below is what reflects how much they cover.
    if (board.distanceKm > maxCorridorKm) continue

    const sharedKm = haversineKm(board.point, alight.point)
    const routeMatch = Math.min(1, sharedKm / tripKm)
    if (routeMatch < MIN_ROUTE_MATCH) continue

    const timeCloseness = 1 - Math.abs(timeDeltaMinutes) / windowMinutes
    const seatHeadroom = Math.min(1, ride.seatsAvailable / SEAT_HEADROOM_CAP)
    const score = 0.6 * routeMatch + 0.25 * timeCloseness + 0.15 * seatHeadroom

    matches.push({ rideId: ride.id, routeMatch, score, timeDeltaMinutes, board, alight })
  }

  const departureById = new Map(rides.map((r) => [r.id, r.departureAt]))

  return matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aAt = departureById.get(a.rideId) ?? ''
    const bAt = departureById.get(b.rideId) ?? ''
    if (aAt !== bAt) return aAt < bAt ? -1 : 1
    return a.rideId < b.rideId ? -1 : 1
  })
}
