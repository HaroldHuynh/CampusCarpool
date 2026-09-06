import { useEffect, useMemo, useState } from 'react'
import { Modal, formatPrice, formatWhen, ratingLabel } from '../components/Shell'
import PageBanner from '../components/PageBanner'
import { useLiveData } from '../lib/useLiveData'
import MapButton from '../components/MapButton'
import LocationPicker, { type PickedLocation } from '../components/LocationPicker'
import ProfileCardDialog from '../components/ProfileCardDialog'
import RideMapDialog from '../map/RideMapDialog'
import { resolveLocation } from '../map/locations'
import {
  closeRideRequest,
  fetchOfferedRides,
  fetchRideContacts,
  offerRide,
  requestSeat,
  cancelSeat,
  type CampusProfile,
  type OfferedRide,
  type RideContact,
} from '../data/api'

const REQUEST_MESSAGE: Record<string, string> = {
  requested: 'Request sent. The driver will confirm.',
  already_requested: 'You already asked for a seat on this ride.',
  full: 'That ride is full.',
  own_ride: 'This is your own ride.',
  not_open: 'That ride is no longer taking requests.',
  missing: 'That ride is gone.',
}

function ContactName({ name, contact }: { name: string; contact?: RideContact }) {
  if (!contact?.contact_value) return <>{name}</>
  return <span className="contact-person" tabIndex={0}>{name}<span className="contact-popover" role="tooltip"><small>{contact.contact_method === 'instagram' ? 'Instagram' : 'Phone'}</small><strong>{contact.contact_value}</strong></span></span>
}

function RidesPage({
  profile,
  modalOpen,
  onCloseModal,
  onOpenModal,
  onToast,
  onGoToRequests,
  onReviewOffer,
}: {
  profile: CampusProfile | null
  modalOpen: boolean
  onCloseModal: () => void
  onOpenModal: () => void
  onToast: (text: string) => void
  onGoToRequests: () => void
  onReviewOffer: (requestId: number) => void
}) {
  const [rides, setRides] = useState<OfferedRide[]>([])
  const [search, setSearch] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Record<string, RideContact[]>>({})

  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [seats, setSeats] = useState('1')
  const [price, setPrice] = useState('20')
  const [description, setDescription] = useState('')
  const [originPoint, setOriginPoint] = useState<PickedLocation | null>(null)
  const [destinationPoint, setDestinationPoint] = useState<PickedLocation | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function load() {
    setLoadError('')

    try {
      const rows = await fetchOfferedRides()
      setRides(rows)
      const related = rows.filter((ride) => ride.driver_profile_id === profile?.id || (ride.mySeat && ride.mySeat.status !== 'declined'))
      const entries = await Promise.all(related.map(async (ride) => [ride.id, await fetchRideContacts(ride.id)] as const))
      setContacts(Object.fromEntries(entries))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load rides.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Rides, requests and seats all change under us while the page is open.
  useLiveData(load, 'rides-board')

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) {
      return rides
    }

    return rides.filter((ride) =>
      [ride.origin, ride.destination].some((value) => value.toLowerCase().includes(term)),
    )
  }, [rides, search])

  async function act(key: string, action: () => Promise<unknown>, done?: string) {
    setBusyId(key)
    setLoadError('')

    try {
      const result = await action()

      if (typeof result === 'string') {
        onToast(REQUEST_MESSAGE[result] ?? result)
      } else if (done) {
        onToast(done)
      }

      await load()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'That did not work.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setIsSaving(true)

    try {
      const resolvedOrigin = originPoint ?? await resolveLocation(origin)
      const resolvedDestination = destinationPoint ?? await resolveLocation(destination, { bias: resolvedOrigin })

      if (!resolvedOrigin || !resolvedDestination) {
        throw new Error('Enter a full pickup and drop-off address.')
      }

      await offerRide({
        origin,
        destination,
        departureAt: `${date}T${time}`,
        seatsAvailable: Number(seats),
        pricePerSeat: Number(price),
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
      onToast('Your ride offer is live!')
      await load()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not post the ride.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main>
      <PageBanner
        eyebrow="FIND A RIDE"
        title="Rides leaving campus"
        primary={{ label: 'Offer a ride', onClick: onOpenModal }}
        secondary={{ label: 'Post a request →', onClick: onGoToRequests }}
      />

      <section className="requests offered-page">
        <div className="section-heading">
          <div>
            <p className="eyebrow">UPCOMING TRIPS</p>
            <div className="heading-with-map">
              <h2>Available rides</h2>
              <MapButton onClick={() => setMapOpen(true)} />
            </div>
          </div>
          <div className="toolbar">
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Search offered rides</span>
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
                <th>Route</th>
                <th>Departure</th>
                <th>Seats open</th>
                <th>Price</th>
                <th>
                  <span className="sr-only">Reserve</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((ride) => {
                const when = formatWhen(ride.departure_at)
                const full = ride.seats_available < 1
                const isMine = profile !== null && ride.driver_profile_id === profile.id

                return (
                  <tr id={`ride-${ride.id}`} key={ride.id}>
                    <td>
                      <span className="destination">
                        {ride.origin} <span className="route-arrow">→</span> {ride.destination}
                      </span>
                      <button
                        type="button"
                        className="profile-trigger driver-rating"
                        disabled={!ride.driver_profile_id || isMine}
                        onClick={() => {
                          setProfileId(ride.driver_profile_id)
                          setProfileOpen(true)
                        }}
                        title={
                          ride.driver && ride.driver.rating_count
                            ? `${ride.driver.display_name}: ${Number(ride.driver.rating_average).toFixed(1)} out of 5 from ${ride.driver.rating_count} rating${ride.driver.rating_count === 1 ? '' : 's'}`
                            : 'No ratings yet'
                        }
                      >
                        <ContactName name={isMine ? 'You' : (ride.driver?.display_name ?? 'Campus driver')} contact={contacts[ride.id]?.find((c) => c.profile_id === ride.driver_profile_id)} /> ·{' '}
                        {ratingLabel(ride.driver)}
                      </button>
                      {ride.note ? <span className="post-description">{ride.note}</span> : null}
                    </td>
                    <td>
                      <strong>{when.date}</strong>
                      <span className="date-note">{when.time}</span>
                    </td>
                    <td>
                      <strong className={full ? 'sold-out' : undefined}>
                        {full
                          ? 'Full'
                          : `${ride.seats_available} seat${ride.seats_available === 1 ? '' : 's'} open`}
                      </strong>
                      <div className="passengers">
                        {ride.requests.length > 0 ? (
                          ride.requests.map((seat) => (
                            <span
                              className={`passenger${seat.status === 'pending' ? ' is-pending' : ''}`}
                              key={seat.id}
                              title={seat.status === 'pending' ? 'Awaiting driver' : 'Confirmed'}
                            >
                              <ContactName name={seat.rider_name} contact={contacts[ride.id]?.find((c) => c.profile_id === seat.rider_profile_id)} />
                              {seat.status === 'pending' ? ' ·' : ''}
                            </span>
                          ))
                        ) : (
                          <span className="no-passengers">No riders yet</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="price">${formatPrice(ride.price_per_seat)}</span>
                      <small className="place-note">per seat</small>
                    </td>
                    <td>
                      {isMine ? (
                        <span className="own-ride-note">
                          {/* Two kinds of pending seat: one you have to answer,
                              one the rider has to answer. Saying "awaiting you"
                              for both told drivers to act when the ball was in
                              the rider's court. */}
                          {ride.requests.some(
                            (r) => r.status === 'pending' && r.initiated_by === 'rider',
                          )
                            ? `${ride.requests.filter((r) => r.status === 'pending' && r.initiated_by === 'rider').length} asked to join`
                            : ride.requests.some(
                                  (r) => r.status === 'pending' && r.initiated_by === 'driver',
                                )
                              ? 'Waiting on rider'
                            : 'Your ride'}
                        </span>
                      ) : ride.mySeat?.status === 'declined' ? (
                        <button className="reserve is-declined" type="button" disabled>Declined</button>
                      ) : ride.mySeat?.status === 'pending' &&
                        ride.mySeat.initiated_by === 'driver' ? (
                        <button
                          type="button"
                          className="offer-link"
                          disabled={!ride.matchedRequestId}
                          onClick={() => onReviewOffer(ride.matchedRequestId!)}
                        >
                          Offered to you by <strong>{ride.driver?.display_name ?? 'your driver'}</strong>
                        </button>
                      ) : ride.mySeat ? (
                        <button
                          className="reserve is-secondary"
                          type="button"
                          disabled={busyId === ride.id}
                          onClick={() => act(ride.id, () => cancelSeat(ride.id), 'Request withdrawn.')}
                        >
                          {ride.mySeat.status === 'pending' ? 'Withdraw' : 'Cancel seat'}
                        </button>
                      ) : (
                        <button
                          className="reserve"
                          type="button"
                          disabled={full || busyId === ride.id}
                          onClick={() => act(ride.id, () => requestSeat(ride.id))}
                        >
                          {full ? 'Full' : busyId === ride.id ? 'Asking…' : 'Request seat'}
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
                  <p>Loading offered rides…</p>
                </>
              ) : (
                <p>
                  {loadError ||
                    (search ? 'No rides match your search.' : 'No rides have been offered yet.')}
                </p>
              )}
            </div>
          ) : null}

          <div className="table-footer">
            <span>
              {isLoading
                ? 'Loading rides…'
                : `${shown.length} available ride${shown.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>

      </section>

      <Modal
        open={modalOpen}
        onClose={onCloseModal}
        eyebrow="NEW RIDE OFFER"
        title="Share your empty seats"
      >
        <form id="offer-form" onSubmit={handleOffer}>
          <LocationPicker id="offer-origin" label="Pickup" value={origin} placeholder="Address or place" onChange={setOrigin} onPick={setOriginPoint} required />
          <LocationPicker id="offer-destination" label="Drop-off" value={destination} placeholder="Address or place" onChange={setDestination} onPick={setDestinationPoint} bias={originPoint} required />
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
          <div className="form-row two-col">
            <label>
              Seats available
              <input
                type="number"
                min="1"
                max="8"
                value={seats}
                required
                onChange={(event) => setSeats(event.target.value)}
              />
            </label>
            <label>
              Price per seat
              <div className="money-input">
                <span>$</span>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="0.01"
                  value={price}
                  required
                  onChange={(event) => setPrice(event.target.value)}
                />
              </div>
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
              {isSaving ? 'Posting…' : 'Post ride'} <span>→</span>
            </button>
          </div>
        </form>
      </Modal>

      <RideMapDialog
        open={mapOpen}
        board="rides"
        profile={profile}
        onClose={() => setMapOpen(false)}
        onRequestSeat={async (rideId) => {
          const outcome = await requestSeat(rideId)
          onToast(REQUEST_MESSAGE[outcome] ?? 'Request sent.')
          await load()
        }}
        onCloseRequest={async (requestId) => {
          if (!profile) {
            throw new Error('Sign in to close a request.')
          }
          await closeRideRequest(requestId, profile.id)
          onToast('Request closed.')
        }}
      />
      <ProfileCardDialog profileId={profileId} open={profileOpen} onClose={() => setProfileOpen(false)} />
    </main>
  )
}

export default RidesPage
