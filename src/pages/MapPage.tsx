import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { fetchOfferedRides, type CampusProfile, type OfferedRide } from '../data/api'
import LocationPicker from '../components/LocationPicker'
import MapCanvas, { type MapMarker, type MapRoute } from '../map/MapCanvas'
import { rankMatches, type Match, type RideCandidate } from '../map/matchEngine'
import { chooseMeetup, computePayoff, SEED_PLACES_AS_MEETUPS } from '../map/meetupSource'
import { resolveLocation, type ResolvedLocation } from '../map/locations'

type Located = { ride: OfferedRide; origin: ResolvedLocation; destination: ResolvedLocation }

const RIDE_COLORS = ['#16785d', '#ff705b', '#0d5e48', '#8a6d3b', '#3d6ea5']

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
          drivers already going most of your way, plus a public place to meet them.
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
            bias={originPoint}
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
          <button className="primary" type="submit">
            Match my trip
          </button>
          {tripError ? (
            <p role="alert" className="map-trip-error">
              {tripError}
            </p>
          ) : null}
        </form>

        <div className="map-layout">
          <MapCanvas routes={routes} markers={markers} fit={fit} onSelectRoute={setSelectedId} />

          <div className="map-panel">
            {isLoading ? <p className="map-panel-intro">Loading rides…</p> : null}
            {loadError ? (
              <p role="alert" className="map-trip-error">
                {loadError}
              </p>
            ) : null}

            {!isLoading && !loadError && !trip ? (
              <p className="map-panel-intro">
                Showing {located.length} upcoming {located.length === 1 ? 'ride' : 'rides'}. Enter
                your trip above to see which of them share your route.
              </p>
            ) : null}

            {trip && matches.length === 0 && !isLoading ? (
              <p className="map-panel-intro">
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
                  <span className="match-rank">
                    {index === 0 ? 'Best match' : `Option ${index + 1}`}
                  </span>
                  <span className="destination">
                    {entry.ride.origin} <span className="route-arrow">→</span>{' '}
                    {entry.ride.destination}
                  </span>
                  <span className="driver-rating">
                    {entry.ride.driver?.display_name ?? 'Campus driver'} · $
                    {Number(entry.ride.price_per_seat).toFixed(0)} · {entry.ride.seats_available}{' '}
                    open
                  </span>
                  <span className={index === 0 ? 'match-share is-best' : 'match-share'}>
                    {share}% route match
                  </span>
                  {isSelected && detail ? (
                    <span className="match-payoff">
                      {detail.meetup.label
                        ? `Meet at ${detail.meetup.label}`
                        : 'Meet at the marked point on the map'}
                      {' · '}
                      {detail.payoff.walkMinutes} min walk
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
