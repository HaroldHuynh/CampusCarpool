import { useEffect, useMemo, useState } from 'react'
import { Modal, formatWhen, ratingLabel } from '../components/Shell'
import { fetchOfferedRides, offerRide, reserveSeat, type CampusProfile, type OfferedRide } from '../data/api'

function RidesPage({
  profile,
  modalOpen,
  onCloseModal,
  onOpenModal,
  onToast,
  onGoToRequests,
}: {
  profile: CampusProfile | null
  modalOpen: boolean
  onCloseModal: () => void
  onOpenModal: () => void
  onToast: (text: string) => void
  onGoToRequests: () => void
}) {
  const [rides, setRides] = useState<OfferedRide[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [seats, setSeats] = useState('1')
  const [price, setPrice] = useState('20')
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function load() {
    setLoadError('')

    try {
      setRides(await fetchOfferedRides())
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load rides.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) {
      return rides
    }

    return rides.filter((ride) =>
      [ride.origin, ride.destination].some((value) => value.toLowerCase().includes(term)),
    )
  }, [rides, search])

  async function handleReserve(ride: OfferedRide) {
    setBusyId(ride.id)
    setLoadError('')

    try {
      const claimed = await reserveSeat(ride.id)
      onToast(claimed ? 'Your seat is reserved!' : 'Sorry, that ride just filled up.')
      await load()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not reserve that seat.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setIsSaving(true)

    try {
      await offerRide({
        origin,
        destination,
        departureAt: `${date}T${time}`,
        seatsAvailable: Number(seats),
        pricePerSeat: Number(price),
      })
      setOrigin('')
      setDestination('')
      setDate('')
      setTime('')
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
      <section className="page-hero">
        <p className="eyebrow">FIND YOUR WAY THERE</p>
        <h1>Rides offered by students</h1>
        <p>Browse upcoming trips, reserve a seat, or share your own empty seats.</p>
        <button className="primary page-hero-button" type="button" onClick={onOpenModal}>
          Offer a ride <span>→</span>
        </button>
      </section>

      <section className="requests offered-page">
        <div className="section-heading">
          <div>
            <p className="eyebrow">UPCOMING TRIPS</p>
            <h2>Available rides</h2>
            <p>Seats shared by drivers in your campus community.</p>
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
            <button className="secondary" type="button" onClick={load} aria-label="Refresh rides">
              ↻
            </button>
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
                const alreadyOn =
                  profile !== null && ride.passengers.includes(profile.display_name)

                return (
                  <tr key={ride.id}>
                    <td>
                      <span className="destination">
                        {ride.origin} <span className="route-arrow">→</span> {ride.destination}
                      </span>
                      <span
                        className="driver-rating"
                        title={
                          ride.driver && ride.driver.rating_count
                            ? `${ride.driver.display_name}: ${Number(ride.driver.rating_average).toFixed(1)} out of 5 from ${ride.driver.rating_count} rating${ride.driver.rating_count === 1 ? '' : 's'}`
                            : 'No ratings yet'
                        }
                      >
                        {isMine ? 'You' : (ride.driver?.display_name ?? 'Campus driver')} ·{' '}
                        {ratingLabel(ride.driver)}
                      </span>
                    </td>
                    <td>
                      <strong>{when.date}</strong>
                      <span className="date-note">{when.time}</span>
                    </td>
                    <td>
                      <strong className={full ? 'sold-out' : undefined}>
                        {full
                          ? 'Sold out'
                          : `${ride.seats_available} seat${ride.seats_available === 1 ? '' : 's'} open`}
                      </strong>
                      <div className="passengers">
                        {ride.passengers.length > 0 ? (
                          ride.passengers.map((name, index) => (
                            <span className="passenger" key={`${name}-${index}`}>
                              {name}
                            </span>
                          ))
                        ) : (
                          <span className="no-passengers">No seats reserved yet</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="price">${Number(ride.price_per_seat).toFixed(0)}</span>
                      <small className="place-note">per seat</small>
                    </td>
                    <td>
                      <button
                        className="reserve"
                        type="button"
                        disabled={full || isMine || alreadyOn || busyId === ride.id}
                        onClick={() => handleReserve(ride)}
                      >
                        {isMine
                          ? 'Your ride'
                          : alreadyOn
                            ? 'Reserved'
                            : full
                              ? 'Full'
                              : busyId === ride.id
                                ? 'Reserving…'
                                : 'Reserve seat'}
                      </button>
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

        <div className="request-cta">
          <div>
            <p className="eyebrow">CAN'T FIND YOUR TRIP?</p>
            <h2>Let drivers know where you need to go.</h2>
          </div>
          <button className="primary cta-link" type="button" onClick={onGoToRequests}>
            View ride requests <span>→</span>
          </button>
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={onCloseModal}
        eyebrow="NEW RIDE OFFER"
        title="Share your empty seats"
      >
        <form id="offer-form" onSubmit={handleOffer}>
          <label>
            Leaving from
            <input
              value={origin}
              maxLength={120}
              placeholder="Campus, dorm, or address"
              required
              onChange={(event) => setOrigin(event.target.value)}
            />
          </label>
          <label>
            Going to
            <input
              value={destination}
              maxLength={120}
              placeholder="City, airport, or event"
              required
              onChange={(event) => setDestination(event.target.value)}
            />
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
              <small>How many riders can join?</small>
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
              <small>Enter 0 if the ride is free.</small>
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
    </main>
  )
}

export default RidesPage
