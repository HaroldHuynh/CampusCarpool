/**
 * Development-only preview of the map dialog.
 *
 * Served at /map-preview.html by the Vite dev server so the map can be worked
 * on and reviewed without signing in. It is a separate entry point: it is not
 * referenced by index.html, it is not part of the production build, and it
 * changes nothing about the real auth gate in App.tsx.
 *
 * Reads are public on the boards, so the pins are real. The two write actions
 * need a signed-in account, so here they explain themselves instead.
 */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/campus.css'
import '../styles/overrides.css'
import '../styles/map.css'
import RideMapDialog, { type MapBoard } from '../map/RideMapDialog'

if (import.meta.env.PROD) {
  throw new Error('mapPreview is a development-only entry point.')
}

function signInFirst(): Promise<void> {
  return Promise.reject(new Error('Sign in to do this — the preview is read-only.'))
}

function Preview() {
  const [open, setOpen] = useState(true)
  const [board, setBoard] = useState<MapBoard>('rides')

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <p className="eyebrow">DEV PREVIEW</p>
      <h1 style={{ font: '600 34px/1.1 Fraunces, serif', margin: '0 0 10px' }}>
        Map dialog
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        The same dialog the map button opens on Rides offered and Ride requests, with live board
        data. Requesting a seat and closing a request need a signed-in account.
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          className="primary"
          type="button"
          onClick={() => {
            setBoard('rides')
            setOpen(true)
          }}
        >
          Open on rides offered
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setBoard('requests')
            setOpen(true)
          }}
        >
          Open on ride requests
        </button>
      </div>

      <RideMapDialog
        open={open}
        board={board}
        profile={null}
        onClose={() => setOpen(false)}
        onRequestSeat={signInFirst}
        onCloseRequest={signInFirst}
      />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
