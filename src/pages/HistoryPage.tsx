import { useCallback, useEffect, useState } from 'react'
import ContactFields from '../components/ContactFields'
import { getAccessRequest, saveProfile, type ContactMethod } from '../auth/auth'
import {
  cancelRide,
  cancelSeat,
  respondToSeatRequest,
  closeRideRequest,
  fetchHistory,
  rateUser,
  type CampusProfile,
  type HistoryRide,
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

function when(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function TripCard({
  ride,
  role,
  children,
}: {
  ride: HistoryRide
  role: 'Driver' | 'Passenger'
  children?: React.ReactNode
}) {
  return (
    <article className="profile-trip">
      <div>
        <span className={`role-tag ${role.toLowerCase()}`}>{role}</span>
        <h3>
          {ride.origin} <span>→</span> {ride.destination}
        </h3>
        <p>{when(ride.departure_at)}</p>
        {children}
      </div>
      <div className="trip-meta">
        <strong>${Number(ride.price_per_seat).toFixed(0)}</strong>
        <span>{role === 'Driver' ? `${ride.seats_available} seats open` : 'Reserved'}</span>
      </div>
    </article>
  )
}

function StarPicker({
  label,
  rated,
  onRate,
}: {
  label: string
  rated: boolean
  onRate: (stars: number) => void
}) {
  const [hover, setHover] = useState(0)
  const [saving, setSaving] = useState(false)

  if (rated) {
    return (
      <div className="rate-person">
        <span>Rated</span>
      </div>
    )
  }

  return (
    <div className="rate-person">
      <span>Rate {label}</span>
      <div className="star-picker" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            // Only the stars up to the one under the cursor light up; every
            // star was previously shown filled, so it always read as 5.
            className={n <= hover ? 'is-lit' : undefined}
            disabled={saving}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={() => {
              // One rating per person per ride is enforced by a unique
              // constraint; block the second click before it errors.
              setSaving(true)
              onRate(n)
            }}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}

function HistoryPage({
  profile,
  onToast,
  onSignOut,
}: {
  profile: CampusProfile | null
  onToast: (t: string) => void
  onSignOut: () => void
}) {
  const [offered, setOffered] = useState<HistoryRide[]>([])
  const [reserved, setReserved] = useState<HistoryRide[]>([])
  const [rated, setRated] = useState<Set<string>>(new Set())
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [contactMethod, setContactMethod] = useState<ContactMethod>('phone')
  const [contactValue, setContactValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    if (!profile) {
      return
    }

    try {
      const result = await fetchHistory(profile.id)
      setOffered(result.offered)
      setReserved(result.reserved)
      setRated(result.rated)
      setRequests(result.requests)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load your history.')
    }
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    getAccessRequest()
      .then((row) => {
        if (!row) {
          return
        }

        setFirstName(row.first_name ?? '')
        setLastName(row.last_name ?? '')
        setContactMethod(row.contact_method ?? 'phone')
        setContactValue(row.contact_value ?? '')
      })
      .catch(() => {})
  }, [])

  async function handleSaveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsSaving(true)

    try {
      await saveProfile({ firstName, lastName, contactMethod, contactValue })
      onToast('Details saved.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save.')
    } finally {
      setIsSaving(false)
    }
  }

  async function runCancel(key: string, action: () => Promise<unknown>, done: string) {
    setErrorMessage('')
    setBusyId(key)

    try {
      await action()
      onToast(done)
      await load()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not cancel that.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRate(rideId: string, ratedId: string, stars: number) {
    if (!profile) {
      return
    }

    try {
      await rateUser(rideId, profile.id, ratedId, stars)
      onToast('Thanks for the rating.')
      await load()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save that rating.')
    }
  }

  const now = new Date().toISOString()
  // A ride is done when the driver says so, not when its departure time
  // passes — a completed trip was showing under "currently offering" purely
  // because it was scheduled for tomorrow.
  const isDone = (r: HistoryRide) =>
    r.status === 'completed' || r.status === 'cancelled' || r.departure_at < now

  const upcomingReserved = reserved.filter((r) => !isDone(r))
  const upcomingOffered = offered.filter((r) => !isDone(r))
  const pastReserved = reserved.filter(isDone)
  const pastOffered = offered.filter(isDone)
  const name = profile?.display_name ?? 'Your profile'

  return (
    <main className="profile-page">
      <section className="profile-head">
        <div className="profile-avatar">{initials(name) || '?'}</div>
        <div>
          <h1>{name}</h1>
          <p>
            <span className="profile-rating">
              {profile && profile.rating_count
                ? `★ ${Number(profile.rating_average).toFixed(1)} (${profile.rating_count})`
                : '☆ No ratings yet'}
            </span>
          </p>
        </div>
        <button className="text-button profile-signout" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </section>

      <section className="profile-stats">
        <article>
          <strong>{upcomingReserved.length}</strong>
          <span>Upcoming reservations</span>
        </article>
        <article>
          <strong>{upcomingOffered.length}</strong>
          <span>Active ride offers</span>
        </article>
        <article>
          <strong>{pastReserved.length + pastOffered.length}</strong>
          <span>Completed trips</span>
        </article>
      </section>

      <section className="profile-section">
        <div className="profile-title">
          <div>
            <h2>Name and contact</h2>
          </div>
        </div>
        <form className="details-form" onSubmit={handleSaveDetails}>
          <div className="form-row two-col">
            <label>
              First name
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </label>
            <label>
              Last name
              <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </label>
          </div>
          <ContactFields
            idPrefix="history"
            method={contactMethod}
            value={contactValue}
            onMethodChange={setContactMethod}
            onValueChange={setContactValue}
          />
          <div className="form-actions">
            <button className="primary" type="submit" disabled={isSaving || !firstName || !lastName}>
              {isSaving ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </form>
      </section>

      <section className="profile-section">
        <div className="profile-title">
          <div>
            <p className="eyebrow">PASSENGER</p>
            <h2>Currently reserved</h2>
          </div>
        </div>
        <div className="trip-list">
          {upcomingReserved.length > 0 ? (
            upcomingReserved.map((ride) => (
              <TripCard key={ride.id} ride={ride} role="Passenger">
                <button
                  type="button"
                  className="cancel-link"
                  disabled={busyId === `seat:${ride.id}`}
                  onClick={() =>
                    runCancel(`seat:${ride.id}`, () => cancelSeat(ride.id), 'Seat released.')
                  }
                >
                  {busyId === `seat:${ride.id}` ? 'Cancelling…' : 'Cancel my seat'}
                </button>
              </TripCard>
            ))
          ) : (
            <div className="empty-trips">
              <p>You have no upcoming reservations.</p>
            </div>
          )}
        </div>
      </section>

      <section className="profile-section">
        <div className="profile-title">
          <div>
            <p className="eyebrow">DRIVER</p>
            <h2>Currently offering</h2>
          </div>
        </div>
        <div className="trip-list">
          {upcomingOffered.length > 0 ? (
            upcomingOffered.map((ride) => (
              <TripCard key={ride.id} ride={ride} role="Driver">
                {(() => {
                  const seats = ride.ride_reservations ?? []
                  const pending = seats.filter((r) => r.status === 'pending')
                  const going = seats.filter((r) => r.status === 'accepted')

                  return (
                    <>
                      {going.length > 0 ? (
                        <p className="trip-riders">
                          Riding with {going.map((r) => r.rider_name).join(', ')}
                        </p>
                      ) : null}

                      {pending.map((seat) => (
                        <div className="seat-request" key={seat.id}>
                          <span>{seat.rider_name} wants a seat</span>
                          <span className="seat-request-actions">
                            <button
                              type="button"
                              className="mini accept"
                              disabled={busyId === `req:${seat.id}`}
                              onClick={() =>
                                runCancel(
                                  `req:${seat.id}`,
                                  () => respondToSeatRequest(seat.id, true),
                                  `${seat.rider_name} is in.`,
                                )
                              }
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              className="mini"
                              disabled={busyId === `req:${seat.id}`}
                              onClick={() =>
                                runCancel(
                                  `req:${seat.id}`,
                                  () => respondToSeatRequest(seat.id, false),
                                  'Request declined.',
                                )
                              }
                            >
                              Decline
                            </button>
                          </span>
                        </div>
                      ))}

                      <div className="trip-actions">
                        <button
                          type="button"
                          className="cancel-link"
                          disabled={busyId === `ride:${ride.id}`}
                          onClick={() =>
                            runCancel(`ride:${ride.id}`, () => cancelRide(ride.id), 'Ride cancelled.')
                          }
                        >
                          Cancel this ride
                        </button>
                      </div>
                    </>
                  )
                })()}
              </TripCard>
            ))
          ) : (
            <div className="empty-trips">
              <p>You aren’t offering any upcoming rides.</p>
            </div>
          )}
        </div>
      </section>

      <section className="profile-section">
        <div className="profile-title">
          <div>
            <p className="eyebrow">RIDER</p>
            <h2>Your open requests</h2>
          </div>
        </div>
        <div className="trip-list">
          {requests.length > 0 ? (
            requests.map((request) => (
              <article className="profile-trip" key={request.id}>
                <div>
                  <span className="role-tag passenger">Request</span>
                  <h3>
                    {request.origin} <span>→</span> {request.destination}
                  </h3>
                  <p>{when(request.departure_at)}</p>
                  <button
                    type="button"
                    className="cancel-link"
                    disabled={busyId === `req:${request.id}`}
                    onClick={() =>
                      runCancel(
                        `req:${request.id}`,
                        () => closeRideRequest(request.id, profile?.id ?? ''),
                        'Request closed.',
                      )
                    }
                  >
                    {busyId === `req:${request.id}` ? 'Closing…' : 'Close this request'}
                  </button>
                </div>
                <div className="trip-meta">
                  <strong>${Number(request.price_offer).toFixed(0)}</strong>
                  <span>offered</span>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-trips">
              <p>You have no open ride requests.</p>
            </div>
          )}
        </div>
      </section>

      <section className="profile-section">
        <div className="profile-title">
          <div>
            <p className="eyebrow">HISTORY</p>
            <h2>Past rides</h2>
          </div>
        </div>
        <div className="trip-list">
          {pastOffered.length + pastReserved.length > 0 ? (
            <>
              {pastOffered.map((ride) => (
                <TripCard key={ride.id} ride={ride} role="Driver">
                  {/* Only people who actually rode: a declined or withdrawn
                      request is not someone you shared a trip with. */}
                  {(ride.ride_reservations ?? [])
                    .filter((p) => p.status === 'accepted')
                    .map((passenger) =>
                    passenger.rider_profile_id ? (
                      <StarPicker
                        key={passenger.rider_profile_id}
                        label={passenger.rider_name}
                        rated={rated.has(`${ride.id}:${passenger.rider_profile_id}`)}
                        onRate={(stars) => handleRate(ride.id, passenger.rider_profile_id!, stars)}
                      />
                    ) : null,
                  )}
                </TripCard>
              ))}
              {pastReserved.map((ride) => (
                <TripCard key={ride.id} ride={ride} role="Passenger">
                  {ride.driver_profile_id ? (
                    <StarPicker
                      label={ride.driver?.display_name ?? 'your driver'}
                      rated={rated.has(`${ride.id}:${ride.driver_profile_id}`)}
                      onRate={(stars) => handleRate(ride.id, ride.driver_profile_id!, stars)}
                    />
                  ) : null}
                </TripCard>
              ))}
            </>
          ) : (
            <div className="empty-trips">
              <p>Your completed rides will appear here.</p>
            </div>
          )}
        </div>
      </section>

      {errorMessage ? <p className="form-error show">{errorMessage}</p> : null}
    </main>
  )
}

export default HistoryPage
