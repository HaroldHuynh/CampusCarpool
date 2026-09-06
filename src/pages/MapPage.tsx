import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { fetchOfferedRides, type CampusProfile, type OfferedRide } from '../data/api'
import LocationPicker from '../components/LocationPicker'
import MapCanvas, { type MapMarker, type MapRoute } from '../map/MapCanvas'
import { rankMatches, type Match, type RideCandidate } from '../map/matchEngine'
import { chooseMeetup, computePayoff, SEED_PLACES_AS_MEETUPS } from '../map/meetupSource'
import { resolveLocation, type ResolvedLocation } from '../map/locations'

type Located = { ride: OfferedRide; origin: ResolvedLocation; destination: ResolvedLocation }

const RIDE_COLORS = ['#16785d', '#ff705b', '#0d5e48', '#8a6d3b', '#3d6ea5']

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

function formatDeparture(iso: string): string {
  const when = new Date(iso)
  return when.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function MapPage({ profile }: { profile: CampusProfile | null }) {
  const [located, setLocated] = useState<Located[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [unmapped, setUnmapped] = useState(0)

  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [departAt, setDepartAt] = useState('')
  const [tripError, setTripError] = useState('')
  const [trip, setTrip] = useState<{
    origin: ResolvedLocation
    destination: ResolvedLocation
    departAt: string
  } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [originPoint, setOriginPoint] = useState<ResolvedLocation | null>(null)

  const load = useCallback(async () => {
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
      const usable = resolved.filter((r): r is Located => r !== null)
      setLocated(usable)
      setUnmapped(rides.length - usable.length)
    } catch {
      setLoadError("Couldn't reach the ride board.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Anchors the destination search near the chosen origin. Without it, common
  // names resolve to the wrong continent — "San Jose airport" lands in the
  // Philippines.
  useEffect(() => {
    let live = true
    if (!origin.trim()) {
      setOriginPoint(null)
      return
    }
    void resolveLocation(origin).then((point) => {
      if (live) setOriginPoint(point)
    })
    return () => {
      live = false
    }
  }, [origin])

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
    return rankMatches(
      { origin: trip.origin, destination: trip.destination, departAt: trip.departAt },
      candidates,
    )
  }, [trip, located, profile])

  const byId = useMemo(() => new Map(located.map((l) => [l.ride.id, l])), [located])

  const selected = useMemo(() => {
    if (matches.length === 0) return null
    if (!selectedId) return matches[0]
    return matches.find((m) => m.rideId === selectedId) ?? matches[0]
  }, [matches, selectedId])

  const colorFor = useCallback(
    (rideId: string) => {
      const index = matches.findIndex((m) => m.rideId === rideId)
      const fallback = located.findIndex((l) => l.ride.id === rideId)
      return RIDE_COLORS[(index >= 0 ? index : Math.max(0, fallback)) % RIDE_COLORS.length]
    },
    [matches, located],
  )

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
      drawn.push({
        id: 'trip',
        from: trip.origin,
        to: trip.destination,
        color: '#16372f',
        dashed: true,
      })
    }
    const source = trip
      ? matches.map((m) => byId.get(m.rideId)).filter((l): l is Located => Boolean(l))
      : located
    for (const entry of source) {
      drawn.push({
        id: entry.ride.id,
        from: entry.origin,
        to: entry.destination,
        color: colorFor(entry.ride.id),
        dimmed: selected !== null && selected.rideId !== entry.ride.id,
      })
    }
    return drawn
  }, [trip, matches, located, byId, selected, colorFor])

  const markers = useMemo<MapMarker[]>(() => {
    const pins: MapMarker[] = []
    if (trip) {
      pins.push({ id: 'from', at: trip.origin, kind: 'origin', label: trip.origin.label })
      pins.push({
        id: 'to',
        at: trip.destination,
        kind: 'destination',
        label: trip.destination.label,
      })
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

  async function handleMatch(event: FormEvent) {
    event.preventDefault()
    setTripError('')

    if (!origin.trim() || !destination.trim()) {
      setTripError('Add both a starting point and a destination.')
      return
    }
    if (!departAt) {
      setTripError('Add the time you want to leave.')
      return
    }

    const [from, to] = await Promise.all([resolveLocation(origin), resolveLocation(destination)])
    if (!from) {
      setTripError(`We couldn't place "${origin}". Pick one of the suggestions instead.`)
      return
    }
    if (!to) {
      setTripError(`We couldn't place "${destination}". Pick one of the suggestions instead.`)
      return
    }

    setTrip({ origin: from, destination: to, departAt: new Date(departAt).toISOString() })
    setSelectedId(null)
  }

  const heading = trip ? 'Rides sharing your route' : 'Rides on the board'
  const count = trip ? matches.length : located.length

  return (
    <main>
      <section className="page-hero">
        <p className="eyebrow">SHARE THE LEG YOU HAVE IN COMMON</p>
        <h1>Match my trip</h1>
        <p>
          Rides rarely start and end exactly where you do. Add your trip and we will find the
          drivers already going most of your way, and a public place to meet them.
        </p>
      </section>

      <section className="requests map-page">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PLAN YOUR TRIP</p>
            <h2>Where are you headed?</h2>
            <p>We compare your route against every upcoming ride, not just exact matches.</p>
          </div>
        </div>

        <form className="trip-bar" onSubmit={handleMatch}>
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
            bias={originPoint}
          />
          <label className="trip-field" htmlFor="map-depart">
            <span>Leaving around</span>
            <input
              id="map-depart"
              type="datetime-local"
              value={departAt}
              onChange={(event) => setDepartAt(event.target.value)}
            />
          </label>
          <button className="primary" type="submit">
            Match my trip <span>→</span>
          </button>
          {tripError ? (
            <p role="alert" className="trip-error">
              {tripError}
            </p>
          ) : null}
        </form>

        <div className="map-layout">
          <MapCanvas routes={routes} markers={markers} fit={fit} onSelectRoute={setSelectedId} />

          <div className="map-panel">
            <div className="panel-head">
              <h3>{heading}</h3>
              {!isLoading && !loadError ? (
                <span className="panel-count">
                  {count} {count === 1 ? 'ride' : 'rides'}
                </span>
              ) : null}
            </div>

            {isLoading ? (
              <div className="map-state">
                <strong>Finding rides</strong>
                <p>Reading the ride board and placing each trip on the map.</p>
              </div>
            ) : null}

            {loadError ? (
              <div className="map-state" role="alert">
                <strong>{loadError}</strong>
                <p>The rides may still be there. Check your connection and load them again.</p>
                <button type="button" onClick={() => void load()}>
                  Try again
                </button>
              </div>
            ) : null}

            {!isLoading && !loadError && located.length === 0 ? (
              <div className="map-state">
                <strong>No upcoming rides yet</strong>
                <p>
                  When someone offers a trip on the Rides offered page, it shows up here with its
                  route drawn on the map.
                </p>
              </div>
            ) : null}

            {!isLoading && !loadError && located.length > 0 && !trip ? (
              <div className="map-state">
                <strong>Add your trip to see the overlap</strong>
                <p>
                  These {located.length} {located.length === 1 ? 'ride is' : 'rides are'} on the map
                  already. Fill in where you are going and we will rank them by how much of your
                  route they share.
                </p>
              </div>
            ) : null}

            {trip && !isLoading && !loadError && matches.length === 0 ? (
              <div className="map-state">
                <strong>Nothing overlaps this trip yet</strong>
                <p>
                  No upcoming ride runs your way within 90 minutes of your departure. Try a
                  different time, or post a ride request so a driver can find you.
                </p>
              </div>
            ) : null}

            {matches.map((match) => {
              const entry = byId.get(match.rideId)
              if (!entry) return null

              const isSelected = selected?.rideId === match.rideId
              const share = Math.round(match.routeMatch * 100)
              const boardAt = clamp01(match.board.t)
              const alightAt = clamp01(match.alight.t)

              return (
                <button
                  key={match.rideId}
                  type="button"
                  className="match-card"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedId(match.rideId)}
                >
                  <span className="match-top">
                    <span className="match-share">
                      {share}%<small>of your route</small>
                    </span>
                    <span
                      className="match-swatch"
                      style={{ background: colorFor(match.rideId) }}
                      aria-hidden="true"
                    />
                  </span>

                  <span className="match-route">
                    {entry.ride.origin} <span className="route-arrow">→</span>{' '}
                    {entry.ride.destination}
                  </span>
                  <span className="match-meta">
                    {entry.ride.driver?.display_name ?? 'Campus driver'} ·{' '}
                    {formatDeparture(entry.ride.departure_at)} · $
                    {Number(entry.ride.price_per_seat).toFixed(0)} · {entry.ride.seats_available}{' '}
                    {entry.ride.seats_available === 1 ? 'seat' : 'seats'} open
                  </span>

                  <span className="route-ribbon" aria-hidden="true">
                    <i
                      style={{
                        left: `${boardAt * 100}%`,
                        width: `${Math.max(2, (alightAt - boardAt) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="ribbon-legend">
                    <span>their start</span>
                    <span>you ride the highlighted leg</span>
                    <span>their end</span>
                  </span>

                  {isSelected && detail ? (
                    <span className="match-payoff">
                      {detail.meetup.label ? (
                        <>
                          Meet at <b>{detail.meetup.label}</b>
                        </>
                      ) : (
                        'Meet at the marked point on the map'
                      )}
                      , a <b>{detail.payoff.walkMinutes} minute</b> walk
                      {detail.payoff.minutesSaved !== null ? (
                        <>
                          {' '}
                          — about <b>{detail.payoff.minutesSaved} minutes</b> quicker than getting
                          to where they set off, estimated.
                        </>
                      ) : (
                        '.'
                      )}
                    </span>
                  ) : null}
                </button>
              )
            })}

            {unmapped > 0 && !isLoading && !loadError ? (
              <p className="panel-note">
                {unmapped} {unmapped === 1 ? 'ride is' : 'rides are'} missing from the map because
                we could not place {unmapped === 1 ? 'its' : 'their'} pickup or drop-off. They are
                still listed on the Rides offered page.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}
