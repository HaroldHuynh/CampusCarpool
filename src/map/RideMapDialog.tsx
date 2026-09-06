import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchOfferedRides,
  fetchRideRequests,
  type CampusProfile,
  type OfferedRide,
  type RideRequest,
} from '../data/api'
import MapCanvas, { type MapMarker, type MapRoute } from './MapCanvas'
import { resolveLocation, type ResolvedLocation } from './locations'
import { formatPrice } from '../components/Shell'

export type MapBoard = 'rides' | 'requests'

type PlottedRide = { kind: 'ride'; ride: OfferedRide; from: ResolvedLocation; to: ResolvedLocation }
type PlottedRequest = {
  kind: 'request'
  request: RideRequest
  from: ResolvedLocation
  to: ResolvedLocation
}
type Plotted = PlottedRide | PlottedRequest

const idOf = (item: Plotted) =>
  item.kind === 'ride' ? `ride:${item.ride.id}` : `req:${item.request.id}`

function formatWhen(iso: string) {
  const when = new Date(iso)
  return when.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Resolves a board row's endpoints. The drop-off is anchored to the pickup so
 * an abbreviation like "SF" cannot land on another continent.
 */
async function plot<T>(
  rows: T[],
  origin: (row: T) => string,
  destination: (row: T) => string,
  points: (row: T) => {
    originLat: number | null
    originLng: number | null
    destinationLat: number | null
    destinationLng: number | null
  },
): Promise<{ row: T; from: ResolvedLocation; to: ResolvedLocation }[]> {
  const settled = await Promise.all(
    rows.map(async (row) => {
      const stored = points(row)
      const from =
        stored.originLat !== null && stored.originLng !== null
          ? { lat: stored.originLat, lng: stored.originLng, label: origin(row) }
          : await resolveLocation(origin(row))
      const to =
        stored.destinationLat !== null && stored.destinationLng !== null
          ? { lat: stored.destinationLat, lng: stored.destinationLng, label: destination(row) }
          : await resolveLocation(destination(row), { bias: from })
      return from && to ? { row, from, to } : null
    }),
  )
  return settled.filter((entry): entry is { row: T; from: ResolvedLocation; to: ResolvedLocation } =>
    entry !== null,
  )
}

export default function RideMapDialog({
  open,
  board,
  profile,
  onClose,
  onRequestSeat,
  onCloseRequest,
}: {
  open: boolean
  /** Which board the map opens on . the page you came from. */
  board: MapBoard
  profile: CampusProfile | null
  onClose: () => void
  onRequestSeat: (rideId: string) => Promise<void>
  onCloseRequest: (requestId: number) => Promise<void>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [filter, setFilter] = useState<MapBoard>(board)
  const [rides, setRides] = useState<PlottedRide[]>([])
  const [requests, setRequests] = useState<PlottedRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [unplaced, setUnplaced] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionNote, setActionNote] = useState('')

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Opening from a page should land on that page's board.
  useEffect(() => {
    if (open) {
      setFilter(board)
      setSelectedId(null)
      setActionNote('')
    }
  }, [open, board])

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [offered, asked] = await Promise.all([fetchOfferedRides(), fetchRideRequests()])

      const plottedRides = await plot(
        offered,
        (r) => r.origin,
        (r) => r.destination,
        (r) => ({
          originLat: r.origin_lat,
          originLng: r.origin_lng,
          destinationLat: r.destination_lat,
          destinationLng: r.destination_lng,
        }),
      )
      const plottedRequests = await plot(
        asked,
        (r) => r.origin,
        (r) => r.destination,
        (r) => ({
          originLat: r.origin_lat,
          originLng: r.origin_lng,
          destinationLat: r.destination_lat,
          destinationLng: r.destination_lng,
        }),
      )

      setRides(plottedRides.map(({ row, from, to }) => ({ kind: 'ride', ride: row, from, to })))
      setRequests(
        plottedRequests.map(({ row, from, to }) => ({ kind: 'request', request: row, from, to })),
      )
      setUnplaced(offered.length - plottedRides.length + (asked.length - plottedRequests.length))
    } catch {
      setLoadError("Couldn't reach the boards.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const items: Plotted[] = useMemo(
    () => (filter === 'rides' ? rides : requests),
    [filter, rides, requests],
  )

  const selected = useMemo(
    () => items.find((item) => idOf(item) === selectedId) ?? null,
    [items, selectedId],
  )

  const markers = useMemo<MapMarker[]>(
    () =>
      items.map((item) => ({
        id: idOf(item),
        at: item.to,
        kind: item.kind === 'ride' ? 'ride' : 'destination',
        label:
          item.kind === 'ride'
            ? `${item.ride.origin} → ${item.ride.destination}`
            : `${item.request.origin} → ${item.request.destination}`,
      })),
    [items],
  )

  const routes = useMemo<MapRoute[]>(() => {
    if (!selected) return []
    return [
      {
        id: idOf(selected),
        from: selected.from,
        to: selected.to,
        color: selected.kind === 'ride' ? '#16785d' : '#ff705b',
      },
    ]
  }, [selected])

  const fit = useMemo(() => {
    if (selected) return [selected.from, selected.to]
    return items.map((item) => item.to)
  }, [selected, items])

  async function act(run: () => Promise<void>, note: string) {
    setBusy(true)
    setActionNote('')
    try {
      await run()
      setActionNote(note)
      await load()
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  const emptyCopy =
    filter === 'rides'
      ? 'No upcoming rides can be placed on the map yet.'
      : 'No open ride requests can be placed on the map yet.'

  return (
    <dialog
      className="map-dialog"
      ref={ref}
      aria-label="Map of rides and requests"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      <div className="modal-head">
        <div>
          <p className="eyebrow">MAP VIEW</p>
          <h2>Where everyone is going</h2>
        </div>
        <button className="close" type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="map-filter" role="group" aria-label="Show on the map">
        <button
          type="button"
          className={filter === 'rides' ? 'is-on' : undefined}
          aria-pressed={filter === 'rides'}
          onClick={() => {
            setFilter('rides')
            setSelectedId(null)
          }}
        >
          Rides offered
          <small>{rides.length}</small>
        </button>
        <button
          type="button"
          className={filter === 'requests' ? 'is-on' : undefined}
          aria-pressed={filter === 'requests'}
          onClick={() => {
            setFilter('requests')
            setSelectedId(null)
          }}
        >
          Ride requests
          <small>{requests.length}</small>
        </button>
      </div>

      <div className="map-dialog-body">
        <MapCanvas routes={routes} markers={markers} fit={fit} onSelectMarker={setSelectedId} />

        <div className="map-dialog-panel">
          {isLoading ? <p className="map-hint">Placing everything on the map…</p> : null}

          {loadError ? (
            <div className="map-state" role="alert">
              <strong>{loadError}</strong>
              <p>Check your connection and load the boards again.</p>
              <button type="button" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : null}

          {!isLoading && !loadError && items.length === 0 ? (
            <p className="map-hint">{emptyCopy}</p>
          ) : null}

          {!isLoading && !loadError && items.length > 0 && !selected ? (
            <p className="map-hint">
              Each pin is a drop-off. Choose one to see the trip and{' '}
              {filter === 'rides' ? 'ask for a seat.' : 'get in touch with the rider.'}
            </p>
          ) : null}

          {selected?.kind === 'ride' ? (
            <div className="pin-card">
              <p className="pin-route">
                {selected.ride.origin} <span className="route-arrow">→</span>{' '}
                {selected.ride.destination}
              </p>
              <p className="pin-meta">
                {selected.ride.driver?.display_name ?? 'Campus driver'} ·{' '}
                {formatWhen(selected.ride.departure_at)}
              </p>
              <p className="pin-meta">
                ${formatPrice(selected.ride.price_per_seat)} per seat ·{' '}
                {selected.ride.seats_available}{' '}
                {selected.ride.seats_available === 1 ? 'seat' : 'seats'} open
              </p>

              {selected.ride.driver_profile_id === profile?.id ? (
                <p className="pin-note">This is your ride.</p>
              ) : selected.ride.mySeat ? (
                <p className="pin-note">You already asked for a seat . {selected.ride.mySeat.status}.</p>
              ) : selected.ride.seats_available < 1 ? (
                <p className="pin-note">No seats left on this one.</p>
              ) : (
                <button
                  className="primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(() => onRequestSeat(selected.ride.id), 'Seat requested.')
                  }
                >
                  Request seat
                </button>
              )}
            </div>
          ) : null}

          {selected?.kind === 'request' ? (
            <div className="pin-card">
              <p className="pin-route">
                {selected.request.origin} <span className="route-arrow">→</span>{' '}
                {selected.request.destination}
              </p>
              <p className="pin-meta">
                {selected.request.rider_name} · {formatWhen(selected.request.departure_at)}
              </p>
              {selected.request.requester_profile_id === profile?.id ? (
                <button
                  className="primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(() => onCloseRequest(selected.request.id), 'Request closed.')
                  }
                >
                  Close request
                </button>
              ) : (
                <p className="pin-contact">
                  Driving this way? Reach {selected.request.rider_name.split(' ')[0]} at{' '}
                  <b>{selected.request.contact_info}</b>.
                </p>
              )}
            </div>
          ) : null}

          {actionNote ? (
            <p className="map-hint" role="status">
              {actionNote}
            </p>
          ) : null}

          {unplaced > 0 && !isLoading && !loadError ? (
            <p className="map-hint">
              {unplaced} {unplaced === 1 ? 'trip is' : 'trips are'} missing because we could not
              place {unplaced === 1 ? 'its' : 'their'} pickup or drop-off.
            </p>
          ) : null}
        </div>
      </div>
    </dialog>
  )
}
