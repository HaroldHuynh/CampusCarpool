import { useEffect, useRef } from 'react'

export type View = 'requests' | 'rides' | 'profile'

export function AppHeader({
  view,
  onChangeView,
  action,
  onSignOut,
}: {
  view: View
  onChangeView: (view: View) => void
  action?: { label: string; onClick: () => void }
  onSignOut: () => void
}) {
  return (
    <header className="site-header">
      <a
        className="brand"
        href="#"
        onClick={(event) => {
          event.preventDefault()
          onChangeView('requests')
        }}
      >
        <span className="brand-mark">↗</span> campus<span>carpool</span>
      </a>

      <nav aria-label="Main navigation">
        <a
          href="#requests"
          className={view === 'requests' ? 'active' : undefined}
          onClick={(event) => {
            event.preventDefault()
            onChangeView('requests')
          }}
        >
          Ride requests
        </a>
        <a
          href="#rides"
          className={view === 'rides' ? 'active' : undefined}
          onClick={(event) => {
            event.preventDefault()
            onChangeView('rides')
          }}
        >
          Rides offered
        </a>
        <a
          href="#profile"
          className={view === 'profile' ? 'active' : undefined}
          onClick={(event) => {
            event.preventDefault()
            onChangeView('profile')
          }}
        >
          My profile
        </a>
      </nav>

      <div className="header-actions">
        {action ? (
          <button className="header-button" type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
        <button className="text-button" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer>
      <a className="brand" href="#">
        <span className="brand-mark">↗</span> campus<span>carpool</span>
      </a>
      <p>Made for students who are going places.</p>
      <span>© 2026 CampusCarpool</span>
    </footer>
  )
}

/** Wraps the native <dialog> so Esc and backdrop clicks behave as they do in
 *  the original markup. */
export function Modal({
  open,
  onClose,
  eyebrow,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current

    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
    }

    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          onClose()
        }
      }}
    >
      <div className="modal-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <button className="close" type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}

export function Toast({ message }: { message: string }) {
  return (
    <div className={`toast${message ? ' show' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  )
}

export function useToast() {
  const timer = useRef<number | undefined>(undefined)

  return function makeToast(setMessage: (value: string) => void) {
    return (text: string) => {
      setMessage(text)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setMessage(''), 3000)
    }
  }
}

export function formatWhen(value: string) {
  const date = new Date(value)

  return {
    date: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

export function ratingLabel(driver: { rating_average: number; rating_count: number } | null) {
  if (!driver || !driver.rating_count) {
    return '☆ New'
  }

  return `★ ${Number(driver.rating_average).toFixed(1)} (${driver.rating_count})`
}
