import { useEffect, useRef, useState } from 'react'

export type View = 'requests' | 'rides' | 'profile'

export type Notice = { id: string; text: string; goTo?: View }

export function formatPrice(value: number | string) {
  const amount = Number(value)
  return amount.toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })
}

export function AppHeader({
  view,
  onChangeView,
  notices,
  onDismissNotice,
  onClearNotices,
}: {
  view: View
  onChangeView: (view: View) => void
  notices: Notice[]
  onDismissNotice: (id: string) => void
  onClearNotices: () => void
}) {
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState<Notice | null>(null)
  const bellRef = useRef<HTMLDivElement>(null)
  const seen = useRef<Set<string> | null>(null)

  // Announce genuinely new items. The first load is not "new" — everything
  // would flash at once the moment the page opens.
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(notices.map((n) => n.id))
      return
    }

    const fresh = notices.find((n) => !seen.current!.has(n.id))
    seen.current = new Set(notices.map((n) => n.id))

    if (!fresh) {
      return
    }

    setFlash(fresh)
  }, [notices])

  // The countdown lives on its own so a background refresh cannot cancel it.
  // `notices` is rebuilt on every realtime update, and a timer started in that
  // effect was being cleared by the next reload, leaving the bubble on screen.
  useEffect(() => {
    if (!flash) {
      return
    }

    const timer = window.setTimeout(() => setFlash(null), 4500)

    return () => window.clearTimeout(timer)
  }, [flash])

  // Changing view should dismiss the menu; leaving it hanging over the next
  // page reads like a stuck overlay.
  useEffect(() => setOpen(false), [view])

  // Close on any click outside the bell, the way a menu should behave.
  useEffect(() => {
    if (!open) {
      return
    }

    function onDocClick(event: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocClick)

    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <header className="site-header">
      <a
        className="brand"
        href="#"
        onClick={(event) => {
          event.preventDefault()
          onChangeView('rides')
        }}
      >
        <span className="brand-mark">↗</span> campus<span>carpool</span>
      </a>

      <nav aria-label="Main navigation">
        <a
          href="#rides"
          className={view === 'rides' ? 'active' : undefined}
          onClick={(event) => {
            event.preventDefault()
            onChangeView('rides')
          }}
        >
          Find a ride
        </a>
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
        <div className="bell-wrap" ref={bellRef}>
          <button
            type="button"
            className="bell"
            aria-label={`Notifications${notices.length ? ` (${notices.length})` : ''}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M10.3 19a2 2 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {notices.length > 0 ? <i className="bell-dot" /> : null}
          </button>

          {flash && !open ? (
            <button
              type="button"
              className="bell-flash"
              onClick={() => {
                setFlash(null)
                setOpen(true)
              }}
            >
              {flash.text}
            </button>
          ) : null}

          {open ? (
            <div className="bell-menu" role="menu">
              <div className="bell-head">
                <span><b>Notifications</b>{notices.length ? <small>{`${notices.length} new`}</small> : null}</span>
                {notices.length > 0 ? (
                  <button type="button" className="bell-clear" onClick={onClearNotices}>
                    Clear all
                  </button>
                ) : null}
              </div>

              {notices.length === 0 ? (
                <p className="bell-empty">Nothing new.</p>
              ) : (
                notices.map((notice) => (
                  <div className="bell-item" key={notice.id}>
                    <span className="bell-item-icon" aria-hidden="true">↗</span>
                    {notice.goTo ? (
                      <button
                        type="button"
                        className="bell-link"
                        onClick={() => {
                          onChangeView(notice.goTo!)
                          // Acting on it is the same as reading it; leaving it
                          // in the list means dismissing everything twice.
                          onDismissNotice(notice.id)
                          setOpen(false)
                        }}
                      >
                        {notice.text}
                      </button>
                    ) : (
                      <span>{notice.text}</span>
                    )}
                    <button
                      type="button"
                      className="bell-dismiss"
                      aria-label="Dismiss"
                      onClick={() => onDismissNotice(notice.id)}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
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
