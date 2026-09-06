import { useCallback, useEffect, useState } from 'react'
import ContactFields from '../components/ContactFields'
import { getAccessRequest, saveProfile, type ContactMethod } from '../auth/auth'
import { fetchHistory, rateUser, type CampusProfile, type HistoryRide } from '../data/api'

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
  return (
    <div className="rate-person">
      <span>{rated ? 'Rated' : `Rate ${label}`}</span>
      <div className="star-picker">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" disabled={rated} title={`${n} star${n === 1 ? '' : 's'}`} onClick={() => onRate(n)}>
            ★
          </button>
        ))}
      </div>
    </div>
  )
}

function HistoryPage({ profile, onToast }: { profile: CampusProfile | null; onToast: (t: string) => void }) {
  const [offered, setOffered] = useState<HistoryRide[]>([])
  const [reserved, setReserved] = useState<HistoryRide[]>([])
  const [rated, setRated] = useState<Set<string>>(new Set())
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
  const upcomingReserved = reserved.filter((r) => r.departure_at >= now)
  const upcomingOffered = offered.filter((r) => r.departure_at >= now)
  const pastReserved = reserved.filter((r) => r.departure_at < now)
  const pastOffered = offered.filter((r) => r.departure_at < now)
  const name = profile?.display_name ?? 'Your profile'

  return (
    <main className="profile-page">
      <section className="profile-head">
        <div className="profile-avatar">{initials(name) || '?'}</div>
        <div>
          <p className="eyebrow">MY CAMPUSCARPOOL</p>
          <h1>{name}</h1>
          <p>
            Your upcoming plans and CampusCarpool history.{' '}
            <span className="profile-rating">
              {profile && profile.rating_count
                ? `★ ${Number(profile.rating_average).toFixed(1)} (${profile.rating_count})`
                : '☆ No ratings yet'}
            </span>
          </p>
        </div>
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
            <p className="eyebrow">YOUR DETAILS</p>
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
            upcomingReserved.map((ride) => <TripCard key={ride.id} ride={ride} role="Passenger" />)
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
            upcomingOffered.map((ride) => <TripCard key={ride.id} ride={ride} role="Driver" />)
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
            <p className="eyebrow">HISTORY</p>
            <h2>Past rides</h2>
          </div>
        </div>
        <div className="trip-list">
          {pastOffered.length + pastReserved.length > 0 ? (
            <>
              {pastOffered.map((ride) => (
                <TripCard key={ride.id} ride={ride} role="Driver">
                  {(ride.ride_reservations ?? []).map((passenger) =>
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
