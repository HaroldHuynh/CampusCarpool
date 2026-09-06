import { useEffect, useMemo, useState } from 'react'
import { Modal, formatWhen } from '../components/Shell'
import {
  closeRideRequest,
  fetchRideRequests,
  postRideRequest,
  type CampusProfile,
  type RideRequest,
} from '../data/api'

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
}: {
  profile: CampusProfile | null
  modalOpen: boolean
  onCloseModal: () => void
  onOpenModal: () => void
  onToast: (text: string) => void
}) {
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const [contact, setContact] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [price, setPrice] = useState('20')

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
      await postRideRequest({
        contactInfo: contact,
        origin,
        destination,
        departureAt: `${date}T${time}`,
        priceOffer: Number(price),
      })
      setOrigin('')
      setDestination('')
      setDate('')
      setTime('')
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

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">THE CAMPUS RIDE BOARD</p>
          <h1>
            Going somewhere?
            <br />
            <em>Go together.</em>
          </h1>
          <p>
            Post where you need to go, when you’re leaving, and what you can chip in. A driver
            headed your way can take it from there.
          </p>
          <div className="hero-actions">
            <button className="primary hero-button" type="button" onClick={onOpenModal}>
              Post a ride request <span>→</span>
            </button>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun" />
          <div className="cloud cloud-one" />
          <div className="cloud cloud-two" />
          <div className="hill hill-back" />
          <div className="hill hill-front" />
          <div className="road" />
          <div className="car">
            <span className="window" />
            <span className="wheel wheel-one" />
            <span className="wheel wheel-two" />
          </div>
        </div>
      </section>

      <section className="requests" id="requests" aria-labelledby="requests-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OPEN REQUESTS</p>
            <h2 id="requests-title">Students looking for a ride</h2>
            <p>See who’s headed your way and help make the trip happen.</p>
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
            <button className="secondary" type="button" onClick={load} aria-label="Refresh requests">
              ↻
            </button>
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
                <th>Offer</th>
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
                        <span
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
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="location">{row.origin}</span>
                    </td>
                    <td>
                      <span className="destination">{row.destination}</span>
                    </td>
                    <td>
                      <strong>{when.date}</strong>
                      <span className="date-note">{when.time}</span>
                    </td>
                    <td>
                      <span className="price">${Number(row.price_offer).toFixed(0)}</span>
                    </td>
                    <td>
                      {isMine ? (
                        <button className="reserve" type="button" onClick={() => handleClose(row)}>
                          Close
                        </button>
                      ) : null}
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
          <label>
            Contact info
            <input
              value={contact}
              maxLength={100}
              placeholder="Email, phone, or @instagram"
              required
              onChange={(event) => setContact(event.target.value)}
            />
            <small>Posted as {profile?.display_name ?? 'your profile name'}.</small>
          </label>
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
          <label>
            Price offer
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
            <small>The amount you’re offering toward gas and the ride.</small>
          </label>

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
    </main>
  )
}

export default RequestsPage
