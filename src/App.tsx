import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import './styles/auth.css'
import { AppHeader, SiteFooter, Toast, type Notice, type View } from './components/Shell'
import RequestsPage from './pages/RequestsPage'
import RidesPage from './pages/RidesPage'
import HistoryPage from './pages/HistoryPage'
import { fetchHistory, getMyProfile, type CampusProfile } from './data/api'
import ContactFields from './components/ContactFields'
import PasswordField from './components/PasswordField'
import {
  getAccessRequest,
  getCurrentUser,
  isCalPolyEmail,
  isProfileIncomplete,
  resendSignUpCode,
  sendPasswordReset,
  verifyRecoveryCode,
  saveProfile,
  sendClaimCode,
  setPassword as setAccountPassword,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  verifyEmailCode,
  verifySignUpCode,
  type ContactMethod,
} from './auth/auth'

/** Supabase's 429 says "you can only request this after N seconds". */
function cooldownFromError(message: string) {
  const match = /after (\d+) seconds/.exec(message)

  return match ? Number(match[1]) : 60
}

type Mode = 'signin' | 'signup'
type Step = 'credentials' | 'verify' | 'finish' | 'reset'

function App() {
  const [mode, setMode] = useState<Mode>('signin')
  const [step, setStep] = useState<Step>('credentials')
  const [view, setView] = useState<View>('rides')
  const [campusProfile, setCampusProfile] = useState<CampusProfile | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const credentialsFormRef = useRef<HTMLFormElement | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('cc-dismissed-notices') ?? '[]') as string[])
    } catch {
      return new Set<string>()
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('cc-dismissed-notices', JSON.stringify([...dismissed]))
    } catch {
      // A private window can refuse storage; dismissing just will not persist.
    }
  }, [dismissed])

  function showToast(text: string) {
    setToastMessage(text)
    window.setTimeout(() => setToastMessage(''), 3000)
  }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [contactMethod, setContactMethod] = useState<ContactMethod>('phone')
  const [contactValue, setContactValue] = useState('')
  const [code, setCode] = useState('')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  // Supabase reads the stored session asynchronously; rendering before it
  // resolves flashes the sign-in screen for anyone already signed in.
  const [isBooting, setIsBooting] = useState(true)
  // A returning account claimed by code has no password yet, and a row created
  // before the profile columns existed needs filling in.
  const [isClaiming, setIsClaiming] = useState(false)
  const [needsPassword, setNeedsPassword] = useState(false)
  // Supabase enforces smtp_max_frequency (60s) per user between sends, so the
  // resend button counts down instead of surfacing a raw 429.
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) {
      return
    }

    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000)

    return () => window.clearTimeout(timer)
  }, [cooldown])

  function syncCredentialsFromForm() {
    const form = credentialsFormRef.current

    if (!form) {
      return
    }

    const formData = new FormData(form)
    const nextEmail = String(formData.get('email') ?? '')
    const nextPassword = String(formData.get('password') ?? '')

    if (nextEmail !== email) {
      setEmail(nextEmail)
    }

    if (nextPassword !== password) {
      setPassword(nextPassword)
    }
  }

  useEffect(() => {
    if (step !== 'credentials') {
      return
    }

    const timers = [
      window.setTimeout(syncCredentialsFromForm, 0),
      window.setTimeout(syncCredentialsFromForm, 250),
      window.setTimeout(syncCredentialsFromForm, 1000),
    ]

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [step, mode, email, password])

  async function enter(user: User | null) {
    if (!user) {
      setCurrentUser(null)
      return
    }

    const profile = await getMyProfile()
    setCampusProfile(profile)
    // Mount the data boards only after the client session and profile lookup
    // have settled. Otherwise the first board request can race password sign-in
    // and leave a stale load error even though a refresh succeeds.
    setCurrentUser(user)

    if (profile) {
      loadNotices(profile.id)
    }

    if (isProfileIncomplete(await getAccessRequest())) {
      setStep('finish')
    }
  }

  useEffect(() => {
    getCurrentUser()
      .then(enter)
      .catch(async () => {
        // A stored session can outlive its user (deleted account, wiped
        // project). Drop the dead token and show the sign-in screen rather
        // than a raw "User from sub claim in JWT does not exist".
        try {
          await signOut()
        } catch {
          // Already gone; nothing to clear.
        }

        setCurrentUser(null)
      })
      .finally(() => setIsBooting(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * What has actually happened, not what is scheduled: a seat someone asked
   * for, a request the driver answered, a trip that got under way. Dismissed
   * ids live in localStorage so clearing one sticks across reloads.
   */
  async function loadNotices(profileId: string) {
    try {
      const history = await fetchHistory(profileId)
      const items: Notice[] = []

      for (const ride of history.offered) {
        if (ride.status === 'completed' || ride.status === 'cancelled') {
          continue
        }

        const route = `${ride.origin} → ${ride.destination}`

        for (const seat of ride.ride_reservations ?? []) {
          if (seat.status === 'pending') {
            items.push({
              id: `ask:${seat.id}`,
              text: `${seat.rider_name} asked for a seat on ${route}`,
              goTo: 'profile',
            })
          }
        }
      }

      for (const ride of history.reserved) {
        const route = `${ride.origin} → ${ride.destination}`

        if (ride.mySeatStatus === 'accepted') {
          items.push({
            id: `ok:${ride.id}`,
            text: `Your seat on ${route} was confirmed`,
            goTo: 'profile',
          })
        }

        if (ride.mySeatStatus === 'declined') {
          items.push({
            id: `no:${ride.id}`,
            text: `Your request for ${route} was declined`,
            goTo: 'rides',
          })
        }

        if (ride.status === 'in_progress') {
          items.push({ id: `go:${ride.id}`, text: `${route} is under way` })
        }
      }

      for (const request of history.matchedOffers) {
        items.push({ id: `matched:${request.id}:${request.matched_ride_id}`, text: `A driver offered a ride from ${request.origin} to ${request.destination}`, goTo: 'rides' })
      }

      setNotices(items.filter((item) => !dismissed.has(item.id)))
    } catch {
      setNotices([])
    }
  }

  function dismissNotice(id: string) {
    const next = new Set(dismissed)
    next.add(id)
    setDismissed(next)
    setNotices((current) => current.filter((item) => item.id !== id))
  }

  function clearNotices() {
    const next = new Set(dismissed)
    notices.forEach((item) => next.add(item.id))
    setDismissed(next)
    setNotices([])
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setCooldown(0)

    // Password managers can fill the DOM fields without emitting React's
    // change events. Read the form at submit time as the source of truth so a
    // visibly filled sign-in form always works on the first click.
    const formData = new FormData(event.currentTarget)
    const submittedEmail = String(formData.get('email') ?? '').trim()
    const submittedPassword = String(formData.get('password') ?? '')
    setEmail(submittedEmail)
    setPassword(submittedPassword)

    if (!isCalPolyEmail(submittedEmail)) {
      setErrorMessage('Use your @calpoly.edu email address.')
      return
    }

    if (!submittedPassword) {
      setErrorMessage('Enter your password.')
      return
    }

    setIsSubmitting(true)

    try {
      if (mode === 'signup') {
        setIsClaiming(false)
        setNeedsPassword(false)

        const result = await signUpWithPassword({
          email: submittedEmail,
          password: submittedPassword,
          firstName,
          lastName,
          contactMethod,
          contactValue,
        })

        // A previous abandoned signup can leave an unconfirmed auth.users row
        // without an access_requests row. Prefer the signup OTP first so the
        // confirmation trigger can create the missing app records.
        if (result.alreadyRegistered) {
          try {
            await resendSignUpCode(submittedEmail)
            setIsClaiming(false)
            setNeedsPassword(false)
          } catch (resendError) {
            const resendMessage =
              resendError instanceof Error ? resendError.message : 'Could not send a new code.'

            if (!/already|registered|confirm/i.test(resendMessage)) {
              throw resendError
            }

            await sendClaimCode(submittedEmail)
            setIsClaiming(true)
            setNeedsPassword(true)
          }
        }

        setPassword('')
        setCooldown(60)
        setStep('verify')
        return
      }

      const user = await signInWithPassword(submittedEmail, submittedPassword)
      setPassword('')
      await enter(user)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'

      // An unconfirmed account is not a dead end . send a fresh code instead.
      if (/not confirmed/i.test(message)) {
        setStep('verify')
        try {
          await resendSignUpCode(submittedEmail)
          setCooldown(60)
        } catch (resendError) {
          const resendMessage =
            resendError instanceof Error ? resendError.message : 'Could not send a new code.'

          if (/after \d+ seconds|rate limit/i.test(resendMessage)) {
            setCooldown(cooldownFromError(resendMessage))
          } else {
            setErrorMessage(resendMessage)
          }
        }
      } else if (/after \d+ seconds|rate limit/i.test(message)) {
        setCooldown(cooldownFromError(message))
        setErrorMessage('Email is cooling down. Try the resend button when it unlocks.')
      } else {
        setErrorMessage(message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleForgotPassword() {
    setErrorMessage('')

    if (!isCalPolyEmail(email)) {
      setErrorMessage('Enter your @calpoly.edu email first.')
      return
    }

    setIsSubmitting(true)

    try {
      await sendPasswordReset(email)
      setNeedsPassword(true)
      setStep('reset')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not send the code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await verifyRecoveryCode(email, code)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'That code did not work.')
      setIsSubmitting(false)
      return
    }

    // The code is spent at this point, so a failure here is about the password
    // itself . say so rather than blaming the code.
    try {
      await setAccountPassword(password)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not set that password. Try another.',
      )
      setIsSubmitting(false)
      return
    }

    try {
      const user = await getCurrentUser()
      setCode('')
      setPassword('')
      setNeedsPassword(false)
      setStep('credentials')
      showToast('Password updated. You are signed in.')
      await enter(user)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResendReset() {
    setErrorMessage('')
    setIsResending(true)

    try {
      await sendPasswordReset(email)
      setCooldown(60)
      setErrorMessage('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send a new code.'

      // A cooldown is not an error worth shouting about . show it on the button.
      if (/after \d+ seconds|rate limit/i.test(message)) {
        setCooldown(cooldownFromError(message))
      } else {
        setErrorMessage(message)
      }
    } finally {
      setIsResending(false)
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const user = isClaiming
        ? await verifyEmailCode(email, code)
        : await verifySignUpCode(email, code)
      setCode('')
      setStep('credentials')

      if (needsPassword) {
        setCurrentUser(user)
        setStep('finish')
        return
      }

      await enter(user)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'That code did not work.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    setErrorMessage('')
    setIsResending(true)

    try {
      if (isClaiming) {
        await sendClaimCode(email)
      } else {
        await resendSignUpCode(email)
      }

      setCooldown(60)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not resend the code.'

      if (/after \d+ seconds|rate limit/i.test(message)) {
        setCooldown(cooldownFromError(message))
      } else {
        setErrorMessage(message)
      }
    } finally {
      setIsResending(false)
    }
  }

  async function handleFinish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      if (needsPassword) {
        await setAccountPassword(password)
      }

      await saveProfile({ firstName, lastName, contactMethod, contactValue })
      setPassword('')
      setNeedsPassword(false)
      setIsClaiming(false)
      setStep('credentials')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save your details.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    setErrorMessage('')
    try {
      await signOut()
      setCurrentUser(null)
      setCampusProfile(null)
      setNotices([])
      setCode('')
      setStep('credentials')
      setMode('signin')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not sign out.')
    }
  }

  if (isBooting) {
    return (
      <main className="auth-shell">
        <span className="spinner" aria-label="Loading" />
      </main>
    )
  }

  if (currentUser && step === 'finish') {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">Almost there</p>
          <h1 id="auth-title">Finish your account</h1>
          <p className="lede">
            We already have <strong>{currentUser.email}</strong> on file. Fill in the rest and
            you&rsquo;re in.
          </p>

          <form className="auth-form" onSubmit={handleFinish}>
            <div className="name-row">
              <label>
                First name
                <input
                  id="finishFirst"
                  type="text"
                  value={firstName}
                  autoComplete="given-name"
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </label>
              <label>
                Last name
                <input
                  id="finishLast"
                  type="text"
                  value={lastName}
                  autoComplete="family-name"
                  onChange={(event) => setLastName(event.target.value)}
                />
              </label>
            </div>

            <ContactFields
              idPrefix="finish"
              method={contactMethod}
              value={contactValue}
              onMethodChange={setContactMethod}
              onValueChange={setContactValue}
            />

            {needsPassword ? (
              <>
                <label htmlFor="finishPassword">Create a password</label>
                <PasswordField
                  id="finishPassword"
                  value={password}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onChange={setPassword}
                />
              </>
            ) : null}

            <button
              className="submit"
            type="submit"
              disabled={
                isSubmitting ||
                !firstName ||
                !lastName ||
                !contactValue ||
                (needsPassword && password.length < 6)
              }
            >
              {isSubmitting ? 'Saving...' : 'Finish'}
            </button>
          </form>

          <div className="status-area" aria-live="polite">
            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          </div>
        </section>
      </main>
    )
  }

  if (currentUser) {
    return (
      <>
        <AppHeader
          view={view}
          onChangeView={(next) => {
            setView(next)
            setModalOpen(false)
          }}
          notices={notices}
          onDismissNotice={dismissNotice}
          onClearNotices={clearNotices}
        />

        {view === 'requests' ? (
          <RequestsPage
            profile={campusProfile}
            modalOpen={modalOpen}
            onOpenModal={() => setModalOpen(true)}
            onCloseModal={() => setModalOpen(false)}
            onToast={showToast}
            onGoToRides={() => setView('rides')}
          />
        ) : view === 'rides' ? (
          <RidesPage
            profile={campusProfile}
            modalOpen={modalOpen}
            onOpenModal={() => setModalOpen(true)}
            onCloseModal={() => setModalOpen(false)}
            onToast={showToast}
            onGoToRequests={() => setView('requests')}
          />
        ) : (
          <HistoryPage profile={campusProfile} onToast={showToast} onSignOut={handleSignOut} />
        )}

        <SiteFooter />
        <Toast message={toastMessage} />
      </>
    )
  }

  if (step === 'reset') {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">Reset password</p>
          <h1 id="auth-title">Choose a new password</h1>
          <p className="lede">
            If <strong>{email}</strong> has an account, we sent it a 6-digit code.
          </p>

          <form className="auth-form" onSubmit={handleReset}>
            <label>
              6-digit code
              <input
                className="code-input"
                type="text"
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))}
              />
            </label>

            <label htmlFor="newPassword">New password</label>
            <PasswordField
              id="newPassword"
              value={password}
              autoComplete="new-password"
              onChange={setPassword}
            />

            <button
              className="submit"
              type="submit"
              disabled={isSubmitting || code.length !== 6 || password.length < 6}
            >
              {isSubmitting ? 'Saving...' : 'Set new password'}
            </button>
          </form>

          <div className="auth-actions">
            <button
              type="button"
              className="auth-alt"
              disabled={isResending || cooldown > 0}
              onClick={handleResendReset}
            >
              {isResending
                ? 'Sending...'
                : cooldown > 0
                  ? `Send a new code in ${cooldown}s`
                  : 'Send a new code'}
            </button>
            <button
              type="button"
              className="auth-alt"
              onClick={() => {
                setStep('credentials')
                setCode('')
                setPassword('')
                setNeedsPassword(false)
                setCooldown(0)
                setErrorMessage('')
              }}
            >
              Back to sign in
            </button>
          </div>

          <div className="status-area" aria-live="polite">
            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          </div>
        </section>
      </main>
    )
  }

  if (step === 'verify') {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">Check your email</p>
          <h1 id="auth-title">Enter your code</h1>
          <p className="lede">
            We sent a 6-digit code to <strong>{email}</strong>.
          </p>

          <form className="auth-form" onSubmit={handleVerify}>
            <label className="sr-only" htmlFor="code">
              6-digit code
            </label>
            <input
              id="code"
              name="code"
              className="code-input"
              type="text"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))}
            />

            <button className="submit"
            type="submit" disabled={isSubmitting || code.length !== 6}>
              {isSubmitting ? 'Checking...' : 'Verify'}
            </button>
          </form>

          <div className="auth-actions">
            <button
              type="button"
              className="auth-alt"
              onClick={handleResend}
              disabled={isResending || cooldown > 0}
            >
              {isResending
                ? 'Sending...'
                : cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : 'Resend code'}
            </button>
            <button
              type="button"
              className="auth-alt"
              onClick={() => {
                setStep('credentials')
                setCode('')
                setErrorMessage('')
              }}
            >
              Back
            </button>
          </div>

          <div className="status-area" aria-live="polite">
            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">CampusCarpool</h1>

        <form
          ref={credentialsFormRef}
          className="auth-form"
          onInput={syncCredentialsFromForm}
          onFocus={syncCredentialsFromForm}
          onSubmit={handleSubmit}
        >
          {mode === 'signup' ? (
            <>
              <div className="name-row">
                <label>
                  First name
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={firstName}
                    autoComplete="given-name"
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </label>
                <label>
                  Last name
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={lastName}
                    autoComplete="family-name"
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </label>
              </div>

              <ContactFields
                idPrefix="signup"
                method={contactMethod}
                value={contactValue}
                onMethodChange={setContactMethod}
                onValueChange={setContactValue}
              />
            </>
          ) : null}

          <label htmlFor="email">Cal Poly email</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="password">Password</label>
          <PasswordField
            id="password"
            name="password"
            value={password}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={setPassword}
          />

          <button
            className="submit"
            type="submit"
            disabled={
              isSubmitting ||
              (mode === 'signup' && (!email || !password || !firstName || !lastName || !contactValue))
            }
          >
            {isSubmitting ? 'Working...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="auth-actions">
          <button
            className="auth-alt"
            type="button"
            onClick={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup')
              setErrorMessage('')
            }}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : 'Create an account'}
          </button>

          {mode === 'signin' ? (
            <button
              className="auth-alt"
              type="button"
              disabled={isSubmitting}
              onClick={handleForgotPassword}
            >
              Forgot password?
            </button>
          ) : null}
        </div>

        <div className="status-area" aria-live="polite">
          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
        </div>
      </section>
    </main>
  )
}

export default App
