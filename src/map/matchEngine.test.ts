import { describe, expect, it } from 'vitest'
import { rankMatches, type RideCandidate, type Trip } from './matchEngine'

const SLO = { lat: 35.28, lng: -120.66 }
const SAN_JOSE = { lat: 37.34, lng: -121.89 }
const DEXTER = { lat: 35.3, lng: -120.66 }
const GILROY = { lat: 37.0, lng: -121.57 }
const FRESNO = { lat: 36.74, lng: -119.79 }

const trip: Trip = {
  origin: DEXTER,
  destination: SAN_JOSE,
  departAt: '2026-09-11T16:00:00.000Z',
}

function ride(over: Partial<RideCandidate> = {}): RideCandidate {
  return {
    id: 'r1',
    origin: SLO,
    destination: SAN_JOSE,
    departureAt: '2026-09-11T16:15:00.000Z',
    seatsAvailable: 2,
    isMine: false,
    hasReserved: false,
    ...over,
  }
}

describe('rankMatches eligibility', () => {
  it('drops rides with no open seat', () => {
    expect(rankMatches(trip, [ride({ seatsAvailable: 0 })])).toHaveLength(0)
  })

  it('drops rides the user drives', () => {
    expect(rankMatches(trip, [ride({ isMine: true })])).toHaveLength(0)
  })

  it('drops rides the user already reserved', () => {
    expect(rankMatches(trip, [ride({ hasReserved: true })])).toHaveLength(0)
  })

  it('drops rides outside the departure window', () => {
    const late = ride({ departureAt: '2026-09-11T20:00:00.000Z' })
    expect(rankMatches(trip, [late])).toHaveLength(0)
  })

  it('keeps a ride inside the departure window', () => {
    expect(rankMatches(trip, [ride()])).toHaveLength(1)
  })
})

describe('rankMatches geometry', () => {
  it('rejects a ride travelling the opposite way', () => {
    const reversed = ride({ origin: SAN_JOSE, destination: SLO })
    expect(rankMatches(trip, [reversed])).toHaveLength(0)
  })

  it('rejects a ride whose corridor is far from the rider', () => {
    const away = ride({ origin: FRESNO, destination: { lat: 36.9, lng: -119.6 } })
    expect(rankMatches(trip, [away])).toHaveLength(0)
  })

  it('scores a fully contained trip near a full route match', () => {
    const [match] = rankMatches(trip, [ride()])
    expect(match.routeMatch).toBeGreaterThan(0.9)
  })

  it('scores a partial overlap below a full one', () => {
    const partial = ride({ id: 'r2', destination: GILROY })
    const [full] = rankMatches(trip, [ride()])
    const [some] = rankMatches(trip, [partial])
    expect(some.routeMatch).toBeLessThan(full.routeMatch)
    expect(some.routeMatch).toBeGreaterThan(0)
  })

  it('caps route match at one', () => {
    const [match] = rankMatches(trip, [ride()])
    expect(match.routeMatch).toBeLessThanOrEqual(1)
  })
})

describe('rankMatches ordering', () => {
  it('ranks the better overlap first', () => {
    const results = rankMatches(trip, [
      ride({ id: 'partial', destination: GILROY }),
      ride({ id: 'full' }),
    ])
    expect(results[0].rideId).toBe('full')
  })

  it('breaks ties deterministically by departure then id', () => {
    const a = ride({ id: 'bbb' })
    const b = ride({ id: 'aaa' })
    const results = rankMatches(trip, [a, b])
    expect(results.map((m) => m.rideId)).toEqual(['aaa', 'bbb'])
  })

  it('reports the signed minute difference from the trip departure', () => {
    const [match] = rankMatches(trip, [ride()])
    expect(match.timeDeltaMinutes).toBe(15)
  })
})

describe('rankMatches partial coverage', () => {
  it('keeps a driver who covers most of the route but stops short', () => {
    const short = ride({ destination: GILROY })
    const [match] = rankMatches(trip, [short])
    expect(match).toBeDefined()
    expect(match.routeMatch).toBeGreaterThan(0.5)
    expect(match.routeMatch).toBeLessThan(1)
  })

  it('drops a ride that shares only a token stretch of the trip', () => {
    const token = ride({ destination: { lat: 35.42, lng: -120.7 } })
    expect(rankMatches(trip, [token])).toHaveLength(0)
  })
})
