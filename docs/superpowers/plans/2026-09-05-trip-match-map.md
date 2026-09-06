# Trip-Match Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Map tab to CampusCarpool that ranks live Supabase rides by how much of the rider's route they share, and names a public meetup point with a computed minutes-saved figure.

**Architecture:** Four pure, network-free modules (`geometry`, `matchEngine`, `meetup`, `locations`) carry all the logic and all the tests. A thin imperative Leaflet wrapper renders. `MapPage` holds state and composes them. Coordinates are derived from the existing free-text `origin`/`destination` columns through a cached geocoder — nothing is stored, no migration is written.

**Tech Stack:** React 19, TypeScript, Vite 8, Leaflet 1.9 (plain, no react-leaflet), Vitest, Supabase JS, Photon geocoder.

Spec: `docs/superpowers/specs/2026-09-05-trip-match-map-design.md`

## Global Constraints

- Branch is `feature/immersive-map`. Do not touch any other branch.
- **No Supabase schema change, no migration file, no edit under `supabase/`.**
- Only three pre-existing source files may be modified, additively: `src/App.tsx`, `src/components/Shell.tsx`, `package.json`. Everything else is a new file.
- Do not modify `package-lock.json` by hand; let npm write it, and do not commit unrelated lockfile churn.
- Reuse the existing palette variables from `src/styles/campus.css`: `--ink #16372f`, `--muted #687a74`, `--cream #f7f4ec`, `--mint #dceee6`, `--green #16785d`, `--green-dark #0d5e48`, `--lime #c7e34b`, `--orange #ff705b`, `--line #dfe5df`.
- Physical constants, used verbatim: walking 5 km/h, local travel 30 km/h, straight-line path factor 1.3, corridor limit 5 km, meetup snap radius 1.2 km, departure window ±90 minutes, minimum reported saving 5 minutes.
- Score weights, used verbatim: `0.60 * routeMatch + 0.25 * timeCloseness + 0.15 * seatHeadroom`.
- Copy rule: the percentage is labelled "route match", never an ETA. Savings are labelled estimates.
- Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Test harness and geometry

**Files:**
- Modify: `package.json` (add `leaflet`, `@types/leaflet`, `vitest`; add `test` script)
- Create: `src/map/geometry.ts`
- Test: `src/map/geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type LatLng = { lat: number; lng: number }`; `haversineKm(a: LatLng, b: LatLng): number`; `type Projection = { t: number; point: LatLng; distanceKm: number }`; `projectOntoSegment(p: LatLng, a: LatLng, b: LatLng): Projection`. `t` is **unclamped** (may be <0 or >1) and is what direction checks compare; `point` is clamped to the segment and is what distance uses.

- [ ] **Step 1: Install dependencies**

```bash
npm install leaflet@^1.9.4
npm install -D @types/leaflet@^1.9.20 vitest@^3.2.4
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write the failing test**

Create `src/map/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { haversineKm, projectOntoSegment } from './geometry'

const SLO = { lat: 35.3, lng: -120.66 }
const PASO = { lat: 35.63, lng: -120.69 }

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(SLO, SLO)).toBe(0)
  })

  it('measures SLO to Paso Robles at roughly 37 km', () => {
    expect(haversineKm(SLO, PASO)).toBeGreaterThan(35)
    expect(haversineKm(SLO, PASO)).toBeLessThan(39)
  })

  it('is symmetric', () => {
    expect(haversineKm(SLO, PASO)).toBeCloseTo(haversineKm(PASO, SLO), 6)
  })
})

describe('projectOntoSegment', () => {
  it('puts a point on the segment at its own position', () => {
    const mid = { lat: 35.465, lng: -120.675 }
    const result = projectOntoSegment(mid, SLO, PASO)
    expect(result.t).toBeGreaterThan(0.4)
    expect(result.t).toBeLessThan(0.6)
    expect(result.distanceKm).toBeLessThan(1)
  })

  it('reports t below zero for a point behind the start', () => {
    const behind = { lat: 35.2, lng: -120.65 }
    expect(projectOntoSegment(behind, SLO, PASO).t).toBeLessThan(0)
  })

  it('reports t above one for a point beyond the end', () => {
    const beyond = { lat: 35.8, lng: -120.7 }
    expect(projectOntoSegment(beyond, SLO, PASO).t).toBeGreaterThan(1)
  })

  it('clamps the returned point to the segment', () => {
    const behind = { lat: 35.2, lng: -120.65 }
    const result = projectOntoSegment(behind, SLO, PASO)
    expect(result.point.lat).toBeCloseTo(SLO.lat, 4)
    expect(result.point.lng).toBeCloseTo(SLO.lng, 4)
  })

  it('measures perpendicular offset from the segment', () => {
    const offset = { lat: 35.465, lng: -120.5 }
    expect(projectOntoSegment(offset, SLO, PASO).distanceKm).toBeGreaterThan(10)
  })

  it('handles a zero-length segment without dividing by zero', () => {
    const result = projectOntoSegment(PASO, SLO, SLO)
    expect(Number.isFinite(result.t)).toBe(true)
    expect(Number.isFinite(result.distanceKm)).toBe(true)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- src/map/geometry.test.ts`
Expected: FAIL, cannot resolve `./geometry`.

- [ ] **Step 5: Implement geometry**

Create `src/map/geometry.ts`:

```ts
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/map/geometry.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/map/geometry.ts src/map/geometry.test.ts
git commit -m "feat(map): add geometry primitives for route overlap

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Match engine

**Files:**
- Create: `src/map/matchEngine.ts`
- Test: `src/map/matchEngine.test.ts`

**Interfaces:**
- Consumes: `LatLng`, `Projection`, `haversineKm`, `projectOntoSegment` from `./geometry`.
- Produces:

```ts
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
export function rankMatches(trip: Trip, rides: RideCandidate[], options?: MatchOptions): Match[]
```

- [ ] **Step 1: Write the failing test**

Create `src/map/matchEngine.test.ts`:

```ts
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
    const results = rankMatches(trip, [ride({ id: 'partial', destination: GILROY }), ride({ id: 'full' })])
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/map/matchEngine.test.ts`
Expected: FAIL, cannot resolve `./matchEngine`.

- [ ] **Step 3: Implement the match engine**

Create `src/map/matchEngine.ts`:

```ts
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

    if (board.distanceKm > maxCorridorKm || alight.distanceKm > maxCorridorKm) continue

    const sharedKm = haversineKm(board.point, alight.point)
    const routeMatch = Math.min(1, sharedKm / tripKm)
    if (routeMatch <= 0) continue

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/map/matchEngine.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/map/matchEngine.ts src/map/matchEngine.test.ts
git commit -m "feat(map): rank rides by shared route, direction and departure

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Meetup point and payoff

**Files:**
- Create: `src/map/meetup.ts`
- Test: `src/map/meetup.test.ts`

**Interfaces:**
- Consumes: `LatLng`, `haversineKm` from `./geometry`.
- Produces:

```ts
export type PlaceCategory = 'transit' | 'public' | 'campus' | 'other'
export type Place = { id: string; label: string; lat: number; lng: number; category: PlaceCategory }
export type Meetup = { point: LatLng; label: string | null; walkKm: number; walkMinutes: number }
export type Payoff = { walkMinutes: number; minutesSaved: number | null }
export function chooseMeetup(riderOrigin: LatLng, projection: LatLng, places: Place[]): Meetup
export function computePayoff(riderOrigin: LatLng, driverOrigin: LatLng, meetup: Meetup): Payoff
export const WALK_KMH: 5
export const LOCAL_KMH: 30
export const PATH_FACTOR: 1.3
export const MIN_SAVINGS_MINUTES: 5
```

`label` is `null` when nothing suitable is in range — the caller must then present the point as approximate rather than naming it. `minutesSaved` is `null` when the saving is under `MIN_SAVINGS_MINUTES`.

- [ ] **Step 1: Write the failing test**

Create `src/map/meetup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { chooseMeetup, computePayoff, type Place } from './meetup'

const rider = { lat: 35.3, lng: -120.66 }
const onRoute = { lat: 35.295, lng: -120.655 }

const places: Place[] = [
  { id: 'transit', label: 'Downtown transit center', lat: 35.2955, lng: -120.6555, category: 'transit' },
  { id: 'far', label: 'Paso Robles park', lat: 35.63, lng: -120.69, category: 'public' },
]

describe('chooseMeetup', () => {
  it('snaps to a named place within range', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    expect(meetup.label).toBe('Downtown transit center')
  })

  it('falls back to the raw projection when nothing is in range', () => {
    const meetup = chooseMeetup(rider, onRoute, [places[1]])
    expect(meetup.label).toBeNull()
    expect(meetup.point).toEqual(onRoute)
  })

  it('falls back when given no places at all', () => {
    expect(chooseMeetup(rider, onRoute, []).label).toBeNull()
  })

  it('prefers a transit stop over an equally close other place', () => {
    const tie: Place[] = [
      { id: 'other', label: 'Some corner', lat: 35.2955, lng: -120.6555, category: 'other' },
      { id: 'stop', label: 'Bus stop', lat: 35.2955, lng: -120.6555, category: 'transit' },
    ]
    expect(chooseMeetup(rider, onRoute, tie).label).toBe('Bus stop')
  })

  it('reports a walking time from the rider origin', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    expect(meetup.walkMinutes).toBeGreaterThan(0)
    expect(Number.isInteger(meetup.walkMinutes)).toBe(true)
  })
})

describe('computePayoff', () => {
  it('reports minutes saved when the driver origin is far away', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    const payoff = computePayoff(rider, { lat: 35.1, lng: -120.6 }, meetup)
    expect(payoff.minutesSaved).not.toBeNull()
    expect(payoff.minutesSaved as number).toBeGreaterThanOrEqual(5)
  })

  it('suppresses a saving below the threshold', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    const payoff = computePayoff(rider, { lat: 35.2996, lng: -120.6596 }, meetup)
    expect(payoff.minutesSaved).toBeNull()
  })

  it('returns whole minutes', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    const payoff = computePayoff(rider, { lat: 35.1, lng: -120.6 }, meetup)
    expect(Number.isInteger(payoff.minutesSaved as number)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/map/meetup.test.ts`
Expected: FAIL, cannot resolve `./meetup`.

- [ ] **Step 3: Implement meetup and payoff**

Create `src/map/meetup.ts`:

```ts
import { haversineKm, type LatLng } from './geometry'

export type PlaceCategory = 'transit' | 'public' | 'campus' | 'other'

export type Place = {
  id: string
  label: string
  lat: number
  lng: number
  category: PlaceCategory
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

function minutesAt(speedKmh: number, straightKm: number): number {
  return (straightKm * PATH_FACTOR) / speedKmh * 60
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

    if (
      best === null ||
      km < bestKm - 0.05 ||
      (Math.abs(km - bestKm) <= 0.05 && CATEGORY_RANK[place.category] < CATEGORY_RANK[best.category])
    ) {
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
 * difference between that trip and the walk to the meetup point.
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/map/meetup.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/map/meetup.ts src/map/meetup.test.ts
git commit -m "feat(map): choose a public meetup point and compute the saving

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Location resolution

**Files:**
- Create: `src/map/geocode.ts`
- Create: `src/map/locations.ts`
- Test: `src/map/locations.test.ts`

**Interfaces:**
- Consumes: `Place`, `PlaceCategory` from `./meetup`.
- Produces:

```ts
// geocode.ts
export type GeocodeResult = { lat: number; lng: number; label: string; category: PlaceCategory }
export function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodeResult[]>

// locations.ts
export type ResolvedLocation = { lat: number; lng: number; label: string }
export type ResolveDeps = { search?: typeof searchPlaces; storage?: Storage | null }
export const SEED_PLACES: Place[]
export function resolveLocation(text: string, deps?: ResolveDeps): Promise<ResolvedLocation | null>
export function clearLocationCache(): void
```

The seed list is deliberately multi-campus, not SLO-only — the product is not Cal Poly exclusive.

- [ ] **Step 1: Write the failing test**

Create `src/map/locations.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLocationCache, resolveLocation, SEED_PLACES } from './locations'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => { map.delete(k) },
    setItem: (k: string, v: string) => { map.set(k, v) },
  } as Storage
}

beforeEach(() => clearLocationCache())

describe('SEED_PLACES', () => {
  it('covers more than one campus region', () => {
    const lngs = new Set(SEED_PLACES.map((p) => Math.round(p.lng)))
    expect(lngs.size).toBeGreaterThan(1)
  })

  it('gives every place a unique id', () => {
    expect(new Set(SEED_PLACES.map((p) => p.id)).size).toBe(SEED_PLACES.length)
  })
})

describe('resolveLocation', () => {
  it('resolves a seed place without touching the network', async () => {
    const search = vi.fn()
    const result = await resolveLocation('Cal Poly', { search, storage: memoryStorage() })
    expect(result).not.toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('matches seed places case-insensitively and ignoring surrounding space', async () => {
    const search = vi.fn()
    const result = await resolveLocation('  cal poly  ', { search, storage: memoryStorage() })
    expect(result).not.toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('falls back to the geocoder for unknown text', async () => {
    const search = vi.fn().mockResolvedValue([
      { lat: 42.28, lng: -83.74, label: 'University of Michigan', category: 'campus' },
    ])
    const result = await resolveLocation('University of Michigan', { search, storage: memoryStorage() })
    expect(result?.label).toBe('University of Michigan')
    expect(search).toHaveBeenCalledOnce()
  })

  it('caches a geocoded result so the second call skips the network', async () => {
    const search = vi.fn().mockResolvedValue([
      { lat: 42.28, lng: -83.74, label: 'University of Michigan', category: 'campus' },
    ])
    const storage = memoryStorage()
    await resolveLocation('University of Michigan', { search, storage })
    await resolveLocation('University of Michigan', { search, storage })
    expect(search).toHaveBeenCalledOnce()
  })

  it('returns null when the geocoder finds nothing', async () => {
    const search = vi.fn().mockResolvedValue([])
    expect(await resolveLocation('qqzzxx', { search, storage: memoryStorage() })).toBeNull()
  })

  it('returns null instead of throwing when the geocoder fails', async () => {
    const search = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await resolveLocation('somewhere', { search, storage: memoryStorage() })).toBeNull()
  })

  it('returns null for empty text', async () => {
    const search = vi.fn()
    expect(await resolveLocation('   ', { search, storage: memoryStorage() })).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('works when storage is unavailable', async () => {
    const search = vi.fn().mockResolvedValue([
      { lat: 1, lng: 2, label: 'Somewhere', category: 'other' },
    ])
    expect(await resolveLocation('somewhere', { search, storage: null })).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/map/locations.test.ts`
Expected: FAIL, cannot resolve `./locations`.

- [ ] **Step 3: Implement the geocoder client**

Create `src/map/geocode.ts`:

```ts
import type { PlaceCategory } from './meetup'

export type GeocodeResult = {
  lat: number
  lng: number
  label: string
  category: PlaceCategory
}

const ENDPOINT = 'https://photon.komoot.io/api'

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, unknown>
}

function categoryOf(properties: Record<string, unknown>): PlaceCategory {
  const key = String(properties.osm_key ?? '')
  const value = String(properties.osm_value ?? '')
  if (key === 'railway' || key === 'aeroway' || value === 'bus_stop' || value === 'station') {
    return 'transit'
  }
  if (value === 'university' || value === 'college' || value === 'school') return 'campus'
  if (key === 'amenity' || key === 'leisure' || key === 'tourism') return 'public'
  return 'other'
}

/** "Dexter Lawn, San Luis Obispo" — stable enough to re-resolve from text. */
function labelOf(properties: Record<string, unknown>): string {
  const name = String(properties.name ?? '').trim()
  const area = String(properties.city ?? properties.county ?? properties.state ?? '').trim()
  if (name && area) return `${name}, ${area}`
  return name || area
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&limit=5`
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Geocoder returned ${response.status}`)
  }

  const body = (await response.json()) as { features?: PhotonFeature[] }

  return (body.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates
    const properties = feature.properties ?? {}
    const label = labelOf(properties)
    if (!coordinates || !label) return []
    return [{ lng: coordinates[0], lat: coordinates[1], label, category: categoryOf(properties) }]
  })
}
```

- [ ] **Step 4: Implement location resolution**

Create `src/map/locations.ts`:

```ts
import { searchPlaces } from './geocode'
import type { Place } from './meetup'

export type ResolvedLocation = { lat: number; lng: number; label: string }

export type ResolveDeps = {
  search?: typeof searchPlaces
  storage?: Storage | null
}

const CACHE_PREFIX = 'cc.geo.'

/**
 * Seed places cover several campuses on purpose: CampusCarpool is not tied to
 * one school, and these make the common demo paths work with no network.
 */
export const SEED_PLACES: Place[] = [
  { id: 'calpoly', label: 'Cal Poly San Luis Obispo', lat: 35.3050, lng: -120.6625, category: 'campus' },
  { id: 'dexter', label: 'Dexter Lawn, San Luis Obispo', lat: 35.3009, lng: -120.6625, category: 'campus' },
  { id: 'slo-transit', label: 'SLO Transit Center', lat: 35.2793, lng: -120.6640, category: 'transit' },
  { id: 'slo-amtrak', label: 'San Luis Obispo Amtrak', lat: 35.2751, lng: -120.6552, category: 'transit' },
  { id: 'sbp', label: 'San Luis Obispo airport', lat: 35.2368, lng: -120.6424, category: 'transit' },
  { id: 'pismo', label: 'Pismo Beach', lat: 35.1428, lng: -120.6413, category: 'public' },
  { id: 'santa-maria', label: 'Santa Maria', lat: 34.9530, lng: -120.4357, category: 'public' },
  { id: 'paso', label: 'Paso Robles', lat: 35.6266, lng: -120.6910, category: 'public' },
  { id: 'gilroy', label: 'Gilroy', lat: 37.0058, lng: -121.5683, category: 'public' },
  { id: 'sjc', label: 'San Jose airport', lat: 37.3639, lng: -121.9289, category: 'transit' },
  { id: 'sj-diridon', label: 'San Jose Diridon Station', lat: 37.3297, lng: -121.9028, category: 'transit' },
  { id: 'sfo', label: 'San Francisco airport', lat: 37.6213, lng: -122.3790, category: 'transit' },
  { id: 'ucdavis', label: 'UC Davis', lat: 38.5382, lng: -121.7617, category: 'campus' },
  { id: 'ucla', label: 'UCLA', lat: 34.0689, lng: -118.4452, category: 'campus' },
  { id: 'ucsb', label: 'UC Santa Barbara', lat: 34.4140, lng: -119.8489, category: 'campus' },
  { id: 'umich', label: 'University of Michigan', lat: 42.2780, lng: -83.7382, category: 'campus' },
  { id: 'alameda', label: 'Alameda', lat: 37.7652, lng: -122.2416, category: 'public' },
  { id: 'lax', label: 'Los Angeles airport', lat: 33.9416, lng: -118.4085, category: 'transit' },
]

const memoryCache = new Map<string, ResolvedLocation | null>()

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

function readStorage(storage: Storage | null, key: string): ResolvedLocation | null | undefined {
  if (!storage) return undefined
  try {
    const raw = storage.getItem(CACHE_PREFIX + key)
    return raw ? (JSON.parse(raw) as ResolvedLocation) : undefined
  } catch {
    return undefined
  }
}

function writeStorage(storage: Storage | null, key: string, value: ResolvedLocation): void {
  if (!storage) return
  try {
    storage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {
    // A full or disabled store is not worth failing a lookup over.
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function clearLocationCache(): void {
  memoryCache.clear()
}

/**
 * Text to coordinates, cheapest source first: session memory, then persisted
 * cache, then the bundled seed table, then the geocoder. Never throws — an
 * unresolvable ride is simply left off the map.
 */
export async function resolveLocation(
  text: string,
  deps: ResolveDeps = {},
): Promise<ResolvedLocation | null> {
  const key = normalize(text)
  if (!key) return null

  if (memoryCache.has(key)) return memoryCache.get(key) ?? null

  const storage = deps.storage === undefined ? defaultStorage() : deps.storage
  const cached = readStorage(storage, key)
  if (cached) {
    memoryCache.set(key, cached)
    return cached
  }

  const seed = SEED_PLACES.find((place) => normalize(place.label) === key)
    ?? SEED_PLACES.find((place) => normalize(place.label).includes(key))
  if (seed) {
    const resolved = { lat: seed.lat, lng: seed.lng, label: seed.label }
    memoryCache.set(key, resolved)
    return resolved
  }

  const search = deps.search ?? searchPlaces
  try {
    const [first] = await search(text)
    if (!first) {
      memoryCache.set(key, null)
      return null
    }
    const resolved = { lat: first.lat, lng: first.lng, label: first.label }
    memoryCache.set(key, resolved)
    writeStorage(storage, key, resolved)
    return resolved
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/map/locations.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Run the whole suite and the type check**

Run: `npm test && npx tsc -b`
Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/map/geocode.ts src/map/locations.ts src/map/locations.test.ts
git commit -m "feat(map): resolve free-text places to coordinates with a cache

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Leaflet canvas

**Files:**
- Create: `src/map/MapCanvas.tsx`
- Create: `src/styles/map.css`

**Interfaces:**
- Consumes: `LatLng` from `./geometry`.
- Produces:

```ts
export type MapRoute = { id: string; from: LatLng; to: LatLng; color: string; dashed?: boolean; dimmed?: boolean }
export type MapMarkerKind = 'origin' | 'destination' | 'meetup' | 'ride'
export type MapMarker = { id: string; at: LatLng; kind: MapMarkerKind; label?: string }
export default function MapCanvas(props: {
  routes: MapRoute[]
  markers: MapMarker[]
  fit: LatLng[]
  onSelectRoute?: (id: string) => void
}): JSX.Element
```

The component owns the Leaflet instance imperatively; React never re-creates the map. Tile failure sets an internal flag that renders a plain message over the map area while the rest of the page keeps working.

- [ ] **Step 1: Write the stylesheet**

Create `src/styles/map.css`:

```css
.map-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr);
  gap: 0;
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
}

.map-canvas {
  position: relative;
  min-height: 520px;
  background: var(--mint);
}

.map-canvas .leaflet-container {
  width: 100%;
  height: 100%;
  background: var(--mint);
}

.map-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 6px;
  padding: 24px;
  text-align: center;
  background: var(--mint);
  color: var(--ink);
  z-index: 500;
}

.map-panel {
  border-left: 1px solid var(--line);
  padding: 18px;
  background: var(--cream);
  max-height: 640px;
  overflow-y: auto;
}

.match-card {
  width: 100%;
  text-align: left;
  display: block;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.match-card[aria-pressed='true'] {
  border: 2px solid var(--green);
}

.match-card:focus-visible {
  outline: 3px solid var(--green-dark);
  outline-offset: 2px;
}

.match-share {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 20px;
  background: var(--mint);
  color: var(--green-dark);
}

.match-share.is-best {
  background: var(--lime);
  color: var(--ink);
}

.match-payoff {
  margin-top: 8px;
  padding: 6px 9px;
  border-radius: 8px;
  font-size: 12px;
  background: var(--mint);
  color: var(--green-dark);
}

.map-trip-form {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}

@media (max-width: 900px) {
  .map-layout { grid-template-columns: minmax(0, 1fr); }
  .map-canvas { min-height: 340px; }
  .map-panel { border-left: 0; border-top: 1px solid var(--line); max-height: none; }
}

@media (prefers-reduced-motion: reduce) {
  .leaflet-fade-anim .leaflet-tile,
  .leaflet-zoom-anim .leaflet-zoom-animated { transition: none !important; }
}
```

- [ ] **Step 2: Implement the canvas**

Create `src/map/MapCanvas.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from './geometry'

export type MapRoute = {
  id: string
  from: LatLng
  to: LatLng
  color: string
  dashed?: boolean
  dimmed?: boolean
}

export type MapMarkerKind = 'origin' | 'destination' | 'meetup' | 'ride'

export type MapMarker = { id: string; at: LatLng; kind: MapMarkerKind; label?: string }

const MARKER_STYLE: Record<MapMarkerKind, { color: string; radius: number }> = {
  origin: { color: '#16372f', radius: 7 },
  destination: { color: '#16372f', radius: 7 },
  meetup: { color: '#c7e34b', radius: 9 },
  ride: { color: '#16785d', radius: 6 },
}

export default function MapCanvas({
  routes,
  markers,
  fit,
  onSelectRoute,
}: {
  routes: MapRoute[]
  markers: MapMarker[]
  fit: LatLng[]
  onSelectRoute?: (id: string) => void
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<L.LayerGroup | null>(null)
  const [tilesBroken, setTilesBroken] = useState(false)

  useEffect(() => {
    if (!holder.current || map.current) return

    const instance = L.map(holder.current, { zoomControl: true, attributionControl: true })
      .setView([35.3, -120.66], 11)

    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    })
    tiles.on('tileerror', () => setTilesBroken(true))
    tiles.addTo(instance)

    layers.current = L.layerGroup().addTo(instance)
    map.current = instance

    return () => {
      instance.remove()
      map.current = null
      layers.current = null
    }
  }, [])

  useEffect(() => {
    const group = layers.current
    if (!group) return
    group.clearLayers()

    for (const route of routes) {
      const line = L.polyline(
        [
          [route.from.lat, route.from.lng],
          [route.to.lat, route.to.lng],
        ],
        {
          color: route.color,
          weight: route.dimmed ? 3 : 5,
          opacity: route.dimmed ? 0.35 : 1,
          dashArray: route.dashed ? '8 7' : undefined,
        },
      )
      if (onSelectRoute) line.on('click', () => onSelectRoute(route.id))
      line.addTo(group)
    }

    for (const marker of markers) {
      const style = MARKER_STYLE[marker.kind]
      const dot = L.circleMarker([marker.at.lat, marker.at.lng], {
        radius: style.radius,
        color: '#16372f',
        weight: 2,
        fillColor: style.color,
        fillOpacity: 1,
      })
      if (marker.label) dot.bindTooltip(marker.label)
      dot.addTo(group)
    }
  }, [routes, markers, onSelectRoute])

  useEffect(() => {
    if (!map.current || fit.length === 0) return
    const bounds = L.latLngBounds(fit.map((p) => [p.lat, p.lng] as [number, number]))
    map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [fit])

  return (
    <div className="map-canvas">
      <div ref={holder} style={{ width: '100%', height: '100%' }} aria-hidden="true" />
      {tilesBroken ? (
        <div className="map-fallback" role="status">
          <strong>Map tiles could not load.</strong>
          <span>The matches beside this map still work.</span>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/map/MapCanvas.tsx src/styles/map.css
git commit -m "feat(map): add Leaflet canvas with tile-failure fallback

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Location picker

**Files:**
- Create: `src/components/LocationPicker.tsx`

**Interfaces:**
- Consumes: `searchPlaces`, `GeocodeResult` from `../map/geocode`; `SEED_PLACES` from `../map/locations`.
- Produces:

```tsx
export default function LocationPicker(props: {
  id: string
  label: string
  value: string
  onChange: (label: string) => void
  placeholder?: string
}): JSX.Element
```

Writes the chosen canonical label into `value` via `onChange`, so the caller stores an ordinary string. Seed places match instantly with no network; the geocoder is queried after a 300 ms pause.

- [ ] **Step 1: Implement the picker**

Create `src/components/LocationPicker.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react'
import { searchPlaces, type GeocodeResult } from '../map/geocode'
import { SEED_PLACES } from '../map/locations'

function seedMatches(query: string): GeocodeResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return SEED_PLACES.filter((place) => place.label.toLowerCase().includes(q))
    .slice(0, 5)
    .map((place) => ({ lat: place.lat, lng: place.lng, label: place.label, category: place.category }))
}

export default function LocationPicker({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (label: string) => void
  placeholder?: string
}) {
  const listId = useId()
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<GeocodeResult[]>([])
  const [open, setOpen] = useState(false)
  const [offline, setOffline] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    const typed = query.trim()
    if (typed.length < 2 || typed === value) {
      setOptions([])
      return
    }

    const seeds = seedMatches(typed)
    setOptions(seeds)

    const timer = setTimeout(() => {
      controller.current?.abort()
      const next = new AbortController()
      controller.current = next

      searchPlaces(typed, next.signal)
        .then((remote) => {
          setOffline(false)
          const seen = new Set(seeds.map((s) => s.label))
          setOptions([...seeds, ...remote.filter((r) => !seen.has(r.label))].slice(0, 7))
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setOffline(true)
        })
    }, 300)

    return () => clearTimeout(timer)
  }, [query, value])

  function choose(option: GeocodeResult) {
    onChange(option.label)
    setQuery(option.label)
    setOpen(false)
  }

  return (
    <label htmlFor={id} style={{ position: 'relative', display: 'block' }}>
      {label}
      <input
        id={id}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {offline ? (
        <small className="place-note">Place search is offline — known places still work.</small>
      ) : null}
      {open && options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 900,
            insetInline: 0,
            margin: '4px 0 0',
            padding: 4,
            listStyle: 'none',
            background: '#fff',
            border: '1px solid var(--line)',
            borderRadius: 10,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {options.map((option) => (
            <li key={`${option.label}-${option.lat}`} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 0,
                  padding: '7px 9px',
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/LocationPicker.tsx
git commit -m "feat(map): add a worldwide location picker with seed fallbacks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Map page and navigation

**Files:**
- Create: `src/pages/MapPage.tsx`
- Modify: `src/components/Shell.tsx` (the `View` union near line 3, and the nav block)
- Modify: `src/App.tsx` (import near line 7, view branch near line 386)
- Modify: `src/main.tsx` (import `./styles/map.css` alongside the other stylesheets)

**Interfaces:**
- Consumes: `fetchOfferedRides`, `type OfferedRide`, `type CampusProfile` from `../data/api`; `rankMatches` from `../map/matchEngine`; `chooseMeetup`, `computePayoff`, `SEED_PLACES` equivalents; `resolveLocation` from `../map/locations`; `MapCanvas` and its types; `LocationPicker`.
- Produces: `export default function MapPage(props: { profile: CampusProfile | null; onToast: (message: string) => void }): JSX.Element`

- [ ] **Step 1: Add the view to the shell**

In `src/components/Shell.tsx`, change the `View` type:

```ts
export type View = 'requests' | 'rides' | 'map' | 'profile'
```

and add this nav link immediately after the "Rides offered" link:

```tsx
<a
  href="#map"
  className={view === 'map' ? 'active' : undefined}
  onClick={(event) => {
    event.preventDefault()
    onChangeView('map')
  }}
>
  Map
</a>
```

- [ ] **Step 2: Implement the page**

Create `src/pages/MapPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { fetchOfferedRides, type CampusProfile, type OfferedRide } from '../data/api'
import LocationPicker from '../components/LocationPicker'
import MapCanvas, { type MapMarker, type MapRoute } from '../map/MapCanvas'
import { rankMatches, type Match, type RideCandidate } from '../map/matchEngine'
import { chooseMeetup, computePayoff, SEED_PLACES_AS_MEETUPS } from '../map/meetupSource'
import { resolveLocation, type ResolvedLocation } from '../map/locations'

type Located = { ride: OfferedRide; origin: ResolvedLocation; destination: ResolvedLocation }

const RIDE_COLORS = ['#16785d', '#ff705b', '#0d5e48', '#8a6d3b', '#3d6ea5']

export default function MapPage({
  profile,
  onToast,
}: {
  profile: CampusProfile | null
  onToast: (message: string) => void
}) {
  const [located, setLocated] = useState<Located[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [unmapped, setUnmapped] = useState(0)

  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [departAt, setDepartAt] = useState('')
  const [tripError, setTripError] = useState('')
  const [trip, setTrip] = useState<{ origin: ResolvedLocation; destination: ResolvedLocation; departAt: string } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let live = true

    async function load() {
      setIsLoading(true)
      setLoadError('')
      try {
        const rides = await fetchOfferedRides()
        const resolved = await Promise.all(
          rides.map(async (ride) => {
            const [from, to] = await Promise.all([
              resolveLocation(ride.origin),
              resolveLocation(ride.destination),
            ])
            return from && to ? { ride, origin: from, destination: to } : null
          }),
        )
        if (!live) return
        const usable = resolved.filter((r): r is Located => r !== null)
        setLocated(usable)
        setUnmapped(rides.length - usable.length)
      } catch {
        if (live) setLoadError('Could not load rides. Try again.')
      } finally {
        if (live) setIsLoading(false)
      }
    }

    void load()
    return () => {
      live = false
    }
  }, [])

  const matches = useMemo<Match[]>(() => {
    if (!trip) return []
    const candidates: RideCandidate[] = located.map(({ ride, origin: from, destination: to }) => ({
      id: ride.id,
      origin: from,
      destination: to,
      departureAt: ride.departure_at,
      seatsAvailable: ride.seats_available,
      isMine: profile !== null && ride.driver_profile_id === profile.id,
      hasReserved: profile !== null && ride.passengers.includes(profile.display_name),
    }))
    return rankMatches({ origin: trip.origin, destination: trip.destination, departAt: trip.departAt }, candidates)
  }, [trip, located, profile])

  const byId = useMemo(() => new Map(located.map((l) => [l.ride.id, l])), [located])
  const selected = selectedId ? matches.find((m) => m.rideId === selectedId) ?? null : matches[0] ?? null

  const detail = useMemo(() => {
    if (!trip || !selected) return null
    const entry = byId.get(selected.rideId)
    if (!entry) return null
    const meetup = chooseMeetup(trip.origin, selected.board.point, SEED_PLACES_AS_MEETUPS)
    const payoff = computePayoff(trip.origin, entry.origin, meetup)
    return { entry, meetup, payoff }
  }, [trip, selected, byId])

  const routes = useMemo<MapRoute[]>(() => {
    const drawn: MapRoute[] = []
    if (trip) {
      drawn.push({ id: 'trip', from: trip.origin, to: trip.destination, color: '#16372f', dashed: true })
    }
    const source = trip ? matches.map((m) => byId.get(m.rideId)).filter((l): l is Located => !!l) : located
    source.forEach((entry, index) => {
      drawn.push({
        id: entry.ride.id,
        from: entry.origin,
        to: entry.destination,
        color: RIDE_COLORS[index % RIDE_COLORS.length],
        dimmed: selected !== null && selected.rideId !== entry.ride.id,
      })
    })
    return drawn
  }, [trip, matches, located, byId, selected])

  const markers = useMemo<MapMarker[]>(() => {
    const pins: MapMarker[] = []
    if (trip) {
      pins.push({ id: 'from', at: trip.origin, kind: 'origin', label: trip.origin.label })
      pins.push({ id: 'to', at: trip.destination, kind: 'destination', label: trip.destination.label })
    }
    if (detail) {
      pins.push({
        id: 'meetup',
        at: detail.meetup.point,
        kind: 'meetup',
        label: detail.meetup.label ?? 'Approximate meetup point',
      })
    }
    if (!trip) {
      for (const entry of located) {
        pins.push({ id: entry.ride.id, at: entry.origin, kind: 'ride', label: entry.origin.label })
      }
    }
    return pins
  }, [trip, detail, located])

  const fit = useMemo(() => {
    if (detail && trip) return [trip.origin, detail.meetup.point, trip.destination]
    if (trip) return [trip.origin, trip.destination]
    return located.flatMap((l) => [l.origin, l.destination])
  }, [trip, detail, located])

  async function handleMatch(event: React.FormEvent) {
    event.preventDefault()
    setTripError('')

    if (!origin.trim() || !destination.trim()) {
      setTripError('Enter where you are starting and where you are going.')
      return
    }
    if (!departAt) {
      setTripError('Choose when you want to leave.')
      return
    }

    const [from, to] = await Promise.all([resolveLocation(origin), resolveLocation(destination)])
    if (!from || !to) {
      setTripError('Could not find one of those places. Pick a suggestion from the list.')
      return
    }

    setTrip({ origin: from, destination: to, departAt: new Date(departAt).toISOString() })
    setSelectedId(null)
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Share the leg you have in common</p>
        <h1>Match my trip</h1>
        <p>
          Rides rarely start and end exactly where you do. Tell us your trip and we will find the
          drivers already going most of your way, and a public place to meet them.
        </p>
      </section>

      <section className="section">
        <form className="map-trip-form" onSubmit={handleMatch}>
          <LocationPicker
            id="map-origin"
            label="Starting from"
            value={origin}
            onChange={setOrigin}
            placeholder="Dexter Lawn, San Luis Obispo"
          />
          <LocationPicker
            id="map-destination"
            label="Going to"
            value={destination}
            onChange={setDestination}
            placeholder="San Jose airport"
          />
          <label htmlFor="map-depart">
            Leaving around
            <input
              id="map-depart"
              type="datetime-local"
              value={departAt}
              onChange={(event) => setDepartAt(event.target.value)}
            />
          </label>
          <button className="primary" type="submit">Match my trip</button>
          {tripError ? <p role="alert" className="form-error">{tripError}</p> : null}
        </form>

        <div className="map-layout">
          <MapCanvas routes={routes} markers={markers} fit={fit} onSelectRoute={setSelectedId} />

          <div className="map-panel">
            {isLoading ? <p>Loading rides…</p> : null}
            {loadError ? <p role="alert">{loadError}</p> : null}

            {!isLoading && !trip ? (
              <p>
                Showing {located.length} upcoming {located.length === 1 ? 'ride' : 'rides'}. Enter
                your trip above to see which of them share your route.
              </p>
            ) : null}

            {trip && matches.length === 0 && !isLoading ? (
              <p>
                No upcoming ride overlaps this route within an hour and a half of your departure.
                Try a wider time or a different starting point.
              </p>
            ) : null}

            {matches.map((match, index) => {
              const entry = byId.get(match.rideId)
              if (!entry) return null
              const isSelected = selected?.rideId === match.rideId
              const share = Math.round(match.routeMatch * 100)

              return (
                <button
                  key={match.rideId}
                  type="button"
                  className="match-card"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedId(match.rideId)}
                >
                  <span className="destination">
                    {entry.ride.origin} <span className="route-arrow">→</span> {entry.ride.destination}
                  </span>
                  <span className="driver-rating">
                    {entry.ride.driver?.display_name ?? 'Campus driver'} · $
                    {Number(entry.ride.price_per_seat).toFixed(0)} · {entry.ride.seats_available} open
                  </span>
                  <span className={index === 0 ? 'match-share is-best' : 'match-share'}>
                    {share}% route match
                  </span>
                  {isSelected && detail ? (
                    <span className="match-payoff">
                      {detail.meetup.label
                        ? `Meet at ${detail.meetup.label}`
                        : 'Meet at the marked point on the map'}{' '}
                      · {detail.payoff.walkMinutes} min walk
                      {detail.payoff.minutesSaved !== null
                        ? ` · saves you about ${detail.payoff.minutesSaved} min`
                        : ''}
                    </span>
                  ) : null}
                </button>
              )
            })}

            {unmapped > 0 ? (
              <p className="place-note">
                {unmapped} {unmapped === 1 ? 'ride is' : 'rides are'} not shown on the map because
                their locations could not be found. They are still on the Rides offered page.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Add the meetup source module**

Create `src/map/meetupSource.ts` — this keeps `meetup.ts` pure and free of the seed import cycle:

```ts
import { SEED_PLACES } from './locations'
import type { Place } from './meetup'

export { chooseMeetup, computePayoff } from './meetup'

export const SEED_PLACES_AS_MEETUPS: Place[] = SEED_PLACES
```

- [ ] **Step 4: Wire the page into the app**

In `src/App.tsx`, add after the `HistoryPage` import:

```tsx
import MapPage from './pages/MapPage'
```

and replace the final branch of the view switch so `map` is explicit and `profile` keeps its fallback:

```tsx
) : view === 'map' ? (
  <MapPage profile={campusProfile} onToast={showToast} />
) : (
  <HistoryPage profile={campusProfile} onToast={showToast} />
)}
```

In `src/main.tsx`, add alongside the existing stylesheet imports:

```tsx
import './styles/map.css'
```

- [ ] **Step 5: Verify build, types, lint and tests**

Run: `npm test && npx tsc -b && npm run lint && npm run build`
Expected: tests pass, no type errors, no lint errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/MapPage.tsx src/map/meetupSource.ts src/components/Shell.tsx src/App.tsx src/main.tsx
git commit -m "feat(map): add the Map tab wiring matches to the live ride board

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Browser verification and polish

**Files:**
- Modify: whichever of the above the verification shows to be wrong.

- [ ] **Step 1: Start the dev server and sign in**

Run the `campus-carpool` preview configuration and open the Map tab.

- [ ] **Step 2: Check the console and network**

Expected: no console errors; Photon requests only fire after typing pauses, not per keystroke.

- [ ] **Step 3: Walk the primary flow**

Enter "Dexter Lawn, San Luis Obispo" → "San Jose airport", pick a departure inside 90 minutes of a seeded ride, and confirm ranked matches appear with a highlighted route and a meetup pin.

- [ ] **Step 4: Check selection sync both ways**

Click a match card, confirm the map highlights that route; click a route on the map, confirm the matching card gains `aria-pressed="true"`.

- [ ] **Step 5: Check the narrow layout**

Resize to 375 px wide, reload, and confirm the panel moves below the map and nothing scrolls horizontally.

- [ ] **Step 6: Check the failure paths**

Confirm the empty state reads correctly with an impossible trip, and that a ride with unresolvable text is counted in the "not shown on the map" note rather than breaking the list.

- [ ] **Step 7: Keyboard pass**

Tab through the form and the match cards; confirm visible focus and that Enter selects a card.

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix(map): corrections from browser verification

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** Success criteria → Tasks 2, 3, 7. No-schema-change constraint → Task 4. Match engine → Task 2. Meetup and payoff → Task 3. Interface and responsive collapse → Tasks 5, 7, 8. Error and empty states → Tasks 4 (null resolution), 5 (tile failure), 6 (geocoder offline), 7 (empty match, unmapped count). Accessibility → Tasks 5 (focus styles), 6 (combobox roles), 7 (`aria-pressed` cards), 8 (keyboard pass). Verification → Tasks 1–4 unit tests, Task 8 manual. Delivery order → Tasks 1–8 in sequence; the app is committed and working after each.

**Deviation from the spec, deliberate:** the spec lists `src/map/meetup.ts` consuming the seed table directly. Task 3 keeps `meetup.ts` pure and Task 7 adds the one-line `meetupSource.ts` to join it to `locations.ts`, avoiding an import cycle between the two. Same behavior, one extra file.

**Placeholders:** none. Every code step carries its code; every command carries its expected result.

**Type consistency:** `LatLng` flows from `geometry.ts` through `matchEngine.ts`, `meetup.ts` and `MapCanvas.tsx` unchanged. `Match.board` / `Match.alight` are named identically in Task 2's definition and Task 7's use. `ResolvedLocation` structurally satisfies `LatLng`, which is what lets Task 7 pass it straight into `rankMatches` and `chooseMeetup`. `Place` is defined once in `meetup.ts` and re-exported by `locations.ts` as the seed type.
