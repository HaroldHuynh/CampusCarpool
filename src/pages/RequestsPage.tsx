import { useEffect, useMemo, useState } from 'react'
import { Modal, formatWhen } from '../components/Shell'
import PageBanner from '../components/PageBanner'
import { useLiveData } from '../lib/useLiveData'
import MapButton from '../components/MapButton'
import LocationPicker, { type PickedLocation } from '../components/LocationPicker'
import ProfileCardDialog from '../components/ProfileCardDialog'
import RideMapDialog from '../map/RideMapDialog'
import { resolveLocation } from '../map/locations'
import {
  closeRideRequest,
  offerRideForRequest,
  requestSeat,
  fetchRideRequests,
  postRideRequest,
  type CampusProfile,
  type RideRequest,
} from '../data/api'

const SEAT_MESSAGE: Record<string, string> = {
  requested: 'Request sent — the driver will confirm.',
  already_requested: 'You already asked for a seat on this ride.',
  full: 'That ride is full.',
  own_ride: 'This is your own ride.',
  not_open: 'That ride is no longer taking requests.',
  missing: 'That ride is gone.',
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function RequestsPage({
  profile,
  modalOpen,
  onCloseModal,
  onOpenModal,
  onToast,
  onGoToRides,
}: {
  profile: CampusProfile | null
  modalOpen: boolean
  onCloseModal: () => void
  onOpenModal: () => void
  onToast: (text: string) => void
  onGoToRides: () => void
}) {
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [search, setSearch] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [description, setDescription] = useState('')
  const [originPoint, setOriginPoint] = useState<PickedLocation | null>(null)
  const [destinationPoint, setDestinationPoint] = useState<PickedLocation | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profileContact, setProfileContact] = useState<string | null>(null)
  const [offerTarget, setOfferTarget] = useState<RideRequest | null>(null)
  const [offerPrice, setOfferPrice] = useState('20')
  const [offerSeats, setOfferSeats] = useState('3')
  const [offerError, setOfferError] = useState('')
  const [isOffering, setIsOffering] = useState(false)

  async function load() {
    setLoadError('')

    try {
      setRequests(await fetchRideRequests())
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load requests.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Rides, requests and seats all change under us while the page is open.
  useLiveData(load, 'requests-board')

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) {
      return requests
    }

    return requests.filter((row) =>
      [row.origin, row.destination, row.rider_name].some((value) =>
        value.toLowerCase().includes(term),
      ),
    )
  }, [requests, search])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setIsSaving(true)

    try {
      const resolvedOrigin = originPoint ?? await resolveLocation(origin)
      const resolvedDestination = destinationPoint ?? await resolveLocation(destination, { bias: resolvedOrigin })

      if (!resolvedOrigin || !resolvedDestination) {
        throw new Error('Enter a full pickup and drop-off address.')
      }

      await postRideRequest({
        origin,
        destination,
        departureAt: `${date}T${time}`,
        note: description,
        originPoint: resolvedOrigin,
        destinationPoint: resolvedDestination,
      })
      setOrigin('')
      setDestination('')
      setDate('')
      setTime('')
      setDescription('')
      setOriginPoint(null)
      setDestinationPoint(null)
      onCloseModal()
      onToast('Your ride request is live!')
      await load()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not post the request.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleClose(request: RideRequest) {
    if (!profile) {
      return
    }

    try {
      await closeRideRequest(request.id, profile.id)
      onToast('Request closed.')
      await load()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not close that request.')
    }
  }

  async function handleOfferForRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!offerTarget) return
    setOfferError('')
    setIsOffering(true)
    try {
      await offerRideForRequest({
        requestId: offerTarget.id,
        seatsAvailable: Number(offerSeats),
        pricePerSeat: Number(offerPrice),
      })
      onToast(`Ride offered to ${offerTarget.rider_name}.`)
      setOfferTarget(null)
      await load()
    } catch (error) {
      setOfferError(error instanceof Error ? error.message : 'Could not offer that ride.')
    } finally {
      setIsOffering(false)
    }
  }

  return (
    <main>
      <PageBanner
        eyebrow="RIDE REQUESTS"
        title="Students looking for a ride"
        primary={{ label: 'Post a request', onClick: onOpenModal }}
        secondary={{ label: 'Browse rides offered →', onClick: onGoToRides }}
      />

      <section className="requests" id="requests" aria-labelledby="requests-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OPEN REQUESTS</p>
            <div className="heading-with-map">
              <h2 id="requests-title">Who needs a ride</h2>
              <MapButton onClick={() => setMapOpen(true)} />
            </div>
          </div>
          <div className="toolbar">
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Search requests</span>
              <input
                type="search"
                value={search}
                placeholder="Search a place…"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Rider</th>
                <th>Leaving from</th>
                <th>Destination</th>
                <th>Departure</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => {
                const when = formatWhen(row.departure_at)
                const isMine = profile !== null && row.requester_profile_id === profile.id

                return (
                  <tr key={row.id}>
                    <td>
                      <div className="rider">
                        <span className={`avatar color-${index % 4}`}>{initials(row.rider_name)}</span>
                        <button
                          type="button"
                          className="profile-trigger"
                          disabled={!row.requester_profile_id || isMine}
                          onClick={() => {
                            setProfileId(row.requester_profile_id)
                            setProfileContact(row.contact_info || null)
                            setProfileOpen(true)
                          }}
                          title={
                            row.requester && row.requester.rating_count
                              ? `${row.rider_name}: ${Number(row.requester.rating_average).toFixed(1)} out of 5 from ${row.requester.rating_count} rating${row.requester.rating_count === 1 ? '' : 's'}`
                              : 'No ratings yet'
                          }
                        >
                          {row.rider_name}
                          <small className="place-note">
                            {row.requester && row.requester.rating_count
                              ? `★ ${Number(row.requester.rating_average).toFixed(1)} (${row.requester.rating_count})`
                              : '☆ New'}
                          </small>
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className="location">{row.origin}</span>
                      {row.note ? <span className="post-description">{row.note}</span> : null}
                    </td>
                    <td>
                      <span className="destination">{row.destination}</span>
                    </td>
                    <td>
                      <strong>{when.date}</strong>
                      <span className="date-note">{when.time}</span>
                    </td>
                    <td>
                      {isMine ? (
                        <button className="reserve" type="button" onClick={() => handleClose(row)}>
                          Close
                        </button>
                      ) : (
                        <button className="reserve" type="button" onClick={() => setOfferTarget(row)}>
                          Offer ride
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {isLoading || loadError || shown.length === 0 ? (
            <div className="table-state show">
              {isLoading ? (
                <>
                  <span className="spinner" />
                  <p>Loading ride requests…</p>
                </>
              ) : (
                <p>
                  {loadError ||
                    (search ? 'No requests match your search.' : 'No open ride requests yet.')}
                </p>
              )}
            </div>
          ) : null}

          <div className="table-footer">
            <span>
              {isLoading ? 'Loading requests…' : `${shown.length} open request${shown.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={onCloseModal}
        eyebrow="NEW RIDE REQUEST"
        title="Where do you need to go?"
      >
        <form id="request-form" onSubmit={handleSubmit}>
          <LocationPicker id="request-origin" label="Pickup" value={origin} placeholder="Address or place" onChange={setOrigin} onPick={setOriginPoint} required />
          <LocationPicker id="request-destination" label="Drop-off" value={destination} placeholder="Address or place" onChange={setDestination} onPick={setDestinationPoint} bias={originPoint} required />
          <label>
            Note
            <textarea value={description} maxLength={300} placeholder="Add a note" onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="form-row two-col">
            <label>
              Date
              <input
                type="date"
                value={date}
                required
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label>
              Time
              <input
                type="time"
                value={time}
                required
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
          </div>
          <p className={`form-error${formError ? ' show' : ''}`} role="alert">
            {formError}
          </p>

          <div className="form-actions">
            <button className="text-button" type="button" onClick={onCloseModal}>
              Cancel
            </button>
            <button className="primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Posting…' : 'Post request'} <span>→</span>
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={offerTarget !== null}
        onClose={() => setOfferTarget(null)}
        eyebrow="RIDE OFFER"
        title={`Offer ${offerTarget?.rider_name ?? 'this rider'} a ride`}
      >
        <form id="offer-request-form" onSubmit={handleOfferForRequest}>
          <div className="request-summary">
            <strong>{offerTarget?.origin} → {offerTarget?.destination}</strong>
            {offerTarget ? <span>{formatWhen(offerTarget.departure_at).date} at {formatWhen(offerTarget.departure_at).time}</span> : null}
          </div>
          <div className="form-row two-col">
            <label>Seats available<input type="number" min="1" max="8" value={offerSeats} required onChange={(event) => setOfferSeats(event.target.value)} /></label>
            <label>Your price per seat<div className="money-input"><span>$</span><input type="number" min="0" max="1000" step="0.01" value={offerPrice} required onChange={(event) => setOfferPrice(event.target.value)} /></div></label>
          </div>
          <p className={`form-error${offerError ? ' show' : ''}`} role="alert">{offerError}</p>
          <div className="form-actions"><button className="text-button" type="button" onClick={() => setOfferTarget(null)}>Cancel</button><button className="primary" type="submit" disabled={isOffering}>{isOffering ? 'Creating…' : 'Create ride offer'}</button></div>
        </form>
      </Modal>

      <RideMapDialog
        open={mapOpen}
        board="requests"
        profile={profile}
        onClose={() => setMapOpen(false)}
        onRequestSeat={async (rideId) => {
          const outcome = await requestSeat(rideId)
          onToast(SEAT_MESSAGE[outcome] ?? 'Request sent.')
        }}
        onCloseRequest={async (requestId) => {
          if (!profile) {
            throw new Error('Sign in to close a request.')
          }
          await closeRideRequest(requestId, profile.id)
          onToast('Request closed.')
          await load()
        }}
      />
      <ProfileCardDialog profileId={profileId} contactOverride={profileContact} open={profileOpen} onClose={() => setProfileOpen(false)} />
    </main>
  )
}

export default RequestsPage
