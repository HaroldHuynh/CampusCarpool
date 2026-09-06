/**
 * Development-only preview of the Map tab.
 *
 * Served at /map-preview.html by the Vite dev server so the map can be worked
 * on and reviewed without signing in. It is a separate entry point: it is not
 * referenced by index.html, it is not part of the production build, and it
 * changes nothing about the real auth gate in App.tsx.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/campus.css'
import '../styles/nav-fix.css'
import '../styles/map.css'
import { AppHeader, SiteFooter } from '../components/Shell'
import MapPage from '../pages/MapPage'

if (import.meta.env.PROD) {
  throw new Error('mapPreview is a development-only entry point.')
}

function Preview() {
  return (
    <>
      <AppHeader
        view="map"
        onChangeView={() => undefined}
        onSignOut={() => undefined}
      />
      <MapPage profile={null} />
      <SiteFooter />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
