/**
 * Development-only preview of the map integration.
 *
 * Served at /map-preview.html by the Vite dev server so the map button and its
 * dialog can be reviewed without signing in. It is a separate entry point: it
 * is not referenced by index.html, it is not part of the production build, and
 * it changes nothing about the real auth gate in App.tsx.
 *
 * It renders the real RidesPage and RequestsPage. Board reads are public so
 * the rows and pins are genuine; anything that writes needs an account.
 */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/campus.css'
import '../styles/overrides.css'
import '../styles/map.css'
import RidesPage from '../pages/RidesPage'
import RequestsPage from '../pages/RequestsPage'
import { Toast } from '../components/Shell'

if (import.meta.env.PROD) {
  throw new Error('mapPreview is a development-only entry point.')
}

function Preview() {
  const [board, setBoard] = useState<'rides' | 'requests'>('requests')
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(text: string) {
    setToast(text)
    window.setTimeout(() => setToast(''), 3000)
  }

  return (
    <>
      <div className="map-filter" style={{ margin: '18px 24px' }}>
        <button
          type="button"
          className={board === 'requests' ? 'is-on' : undefined}
          onClick={() => setBoard('requests')}
        >
          Ride requests
        </button>
        <button
          type="button"
          className={board === 'rides' ? 'is-on' : undefined}
          onClick={() => setBoard('rides')}
        >
          Rides offered
        </button>
      </div>

      {board === 'rides' ? (
        <RidesPage
          profile={null}
          modalOpen={modalOpen}
          onOpenModal={() => setModalOpen(true)}
          onCloseModal={() => setModalOpen(false)}
          onToast={showToast}
          onGoToRequests={() => setBoard('requests')}
          onReviewOffer={() => {}}
          onOpenMyRide={() => {}}
        />
      ) : (
        <RequestsPage
          profile={null}
          modalOpen={modalOpen}
          onOpenModal={() => setModalOpen(true)}
          onCloseModal={() => setModalOpen(false)}
          onToast={showToast}
          onGoToRides={() => setBoard('rides')}
        />
      )}

      <Toast message={toast} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
