import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import './styles/auth.css'
import { AppHeader, SiteFooter, Toast, type View } from './components/Shell'
import RequestsPage from './pages/RequestsPage'
import RidesPage from './pages/RidesPage'
import HistoryPage from './pages/HistoryPage'
import MapPage from './pages/MapPage'
import { getMyProfile, type CampusProfile } from './data/api'
import ContactFields from './components/ContactFields'
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

type Mode = 'signin' | 'signup'
type Step = 'credentials' | 'verify' | 'finish' | 'reset'

function App() {
  const [mode, setMode] = useState<Mode>('signin')
  const [step, setStep] = useState<Step>('credentials')
  const [view, setView] = useState<View>('requests')
  const [campusProfile, setCampusProfile] = useState<CampusProfile | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

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
  // A returning account claimed by code has no password yet, and a row created
  // before the profile columns existed needs filling in.
  const [isClaiming, setIsClaiming] = useState(false)
  const [needsPassword, setNeedsPassword] = useState(false)

  async function enter(user: User | null) {
    setCurrentUser(user)

    if (!user) {
      return
    }

    setCampusProfile(await getMyProfile())

    if (isProfileIncomplete(await getAccessRequest())) {
      setStep('finish')
    }
  }

  useEffect(() => {
    getCurrentUser()
      .then(enter)
      .catch((error: Error) => setErrorMessage(error.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')

    if (!isCalPolyEmail(email)) {
      setErrorMessage('Use your @calpoly.edu email address.')
      return
    }

    setIsSubmitting(true)

    try {
      if (mode === 'signup') {
        const result = await signUpWithPassword({
          email,
          password,
          firstName,
          lastName,
          contactMethod,
          contactValue,
        })

        // Registered already (e.g. from the old invite flow): send a code so
        // they can claim the account and set a password instead.
        if (result.alreadyRegistered) {
          await sendClaimCode(email)
          setIsClaiming(true)
          setNeedsPassword(true)
        }

        setPassword('')
        setStep('verify')
        return
      }

      const user = await signInWithPassword(email, password)
      setPassword('')
      await enter(user)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'

      // An unconfirmed account is not a dead end — send a fresh code instead.
      if (/not confirmed/i.test(message)) {
        setStep('verify')
        resendSignUpCode(email).catch(() => {})
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
    // itself — say so rather than blaming the code.
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
      await resendSignUpCode(email)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not resend the code.')
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
      setCode('')
      setStep('credentials')
      setMode('signin')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not sign out.')
    }
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
                  placeholder="Harold"
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
                  placeholder="Huynh"
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
                <input
                  id="finishPassword"
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  onChange={(event) => setPassword(event.target.value)}
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
          action={
            view === 'requests'
              ? { label: '+ Post a request', onClick: () => setModalOpen(true) }
              : view === 'rides'
                ? { label: '+ Offer a ride', onClick: () => setModalOpen(true) }
                : undefined
          }
          onSignOut={handleSignOut}
        />

        {view === 'requests' ? (
          <RequestsPage
            profile={campusProfile}
            modalOpen={modalOpen}
            onOpenModal={() => setModalOpen(true)}
            onCloseModal={() => setModalOpen(false)}
            onToast={showToast}
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
        ) : view === 'map' ? (
          <MapPage profile={campusProfile} />
        ) : (
          <HistoryPage profile={campusProfile} onToast={showToast} />
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

            <label>
              New password
              <input
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

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
              onClick={() => {
                setStep('credentials')
                setCode('')
                setPassword('')
                          setNeedsPassword(false)
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
              disabled={isResending}
            >
              {isResending ? 'Sending...' : 'Resend code'}
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
        <p className="eyebrow">Cal Poly only</p>
        <h1 id="auth-title">CampusCarpool</h1>

        <form className="auth-form" onSubmit={handleSubmit}>
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
                    placeholder="Sally"
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
                    placeholder="Nguyen"
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
            value={email}
            autoComplete="email"
            placeholder="you@calpoly.edu"
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="At least 6 characters"
            onChange={(event) => setPassword(event.target.value)}
          />

          <button
            className="submit"
            type="submit"
            disabled={
              isSubmitting ||
              !email ||
              !password ||
              (mode === 'signup' && (!firstName || !lastName || !contactValue))
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
