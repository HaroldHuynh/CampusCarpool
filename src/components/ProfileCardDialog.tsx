import { useEffect, useState } from 'react'
import { fetchProfileCard, type ProfileCard } from '../data/api'
import { Modal } from './Shell'

export default function ProfileCardDialog({
  profileId,
  contactOverride,
  open,
  onClose,
  onMessage,
}: {
  profileId: string | null
  /** Open ride requests deliberately publish a contact route for prospective drivers. */
  contactOverride?: string | null
  open: boolean
  onClose: () => void
  onMessage?: (profileId: string, displayName: string, ratingAverage: number, ratingCount: number) => void
}) {
  const [profile, setProfile] = useState<ProfileCard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !profileId) return
    setProfile(null)
    setError('')
    void fetchProfileCard(profileId)
      .then(setProfile)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Could not load this profile.'),
      )
  }, [open, profileId])

  return (
    <Modal open={open} onClose={onClose} eyebrow="MEMBER PROFILE" title={profile?.display_name ?? 'Profile'}>
      <div className="profile-card-dialog">
        {error ? <p className="form-error show">{error}</p> : null}
        {!profile && !error ? <p className="profile-card-loading">Loading profile…</p> : null}
        {profile ? (
          <>
            <p className="profile-card-rating">
              {profile.rating_count
                ? `★ ${Number(profile.rating_average).toFixed(1)} from ${profile.rating_count} review${profile.rating_count === 1 ? '' : 's'}`
                : 'No reviews yet'}
            </p>
            {contactOverride || (profile.contact_available && profile.contact_value) ? (
              <p className="profile-contact">
                <strong>{contactOverride ? 'Contact' : profile.contact_method === 'instagram' ? 'Instagram' : 'Phone'}:</strong>{' '}
                {contactOverride ?? profile.contact_value}
              </p>
            ) : (
              <p className="profile-contact is-private">Contact details appear after a seat request is made.</p>
            )}
            {profileId && onMessage ? (
              <button
                type="button"
                className="secondary profile-message-button"
                onClick={() => {
                  onMessage(profileId, profile.display_name, profile.rating_average, profile.rating_count)
                  onClose()
                }}
              >
                Message {profile.display_name.split(/\s+/)[0]} <span>→</span>
              </button>
            ) : null}
            {profile.reviews.length ? (
              <section className="profile-reviews" aria-label="Reviews">
                <h3>Reviews</h3>
                {profile.reviews.map((review) => (
                  <article key={review.id}>
                    <strong>{review.reviewer_name}</strong>
                    <span>{'★'.repeat(review.stars)}{'☆'.repeat(5 - review.stars)}</span>
                  </article>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  )
}
