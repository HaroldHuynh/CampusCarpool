import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from './geometry'

export type MapRoute = {
  id: string
  from: LatLng
  to: LatLng
  color: string
  dashed?: boolean
  dimmed?: boolean
}

export type MapMarkerKind = 'origin' | 'destination' | 'meetup' | 'ride' | 'request'

export type MapMarker = { id: string; at: LatLng; kind: MapMarkerKind; label?: string }

const MARKER_STYLE: Record<MapMarkerKind, { color: string; stroke: string; radius: number }> = {
  origin: { color: '#16372f', stroke: '#16372f', radius: 7 },
  destination: { color: '#ff705b', stroke: '#16372f', radius: 7 },
  meetup: { color: '#c7e34b', stroke: '#16372f', radius: 9 },
  ride: { color: '#16785d', stroke: '#16372f', radius: 6 },
  request: { color: '#ff705b', stroke: '#8d6518', radius: 9 },
}

export default function MapCanvas({
  routes,
  markers,
  fit,
  onSelectRoute,
  onSelectMarker,
}: {
  routes: MapRoute[]
  markers: MapMarker[]
  fit: LatLng[]
  onSelectRoute?: (id: string) => void
  onSelectMarker?: (id: string) => void
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<L.LayerGroup | null>(null)
  const [tilesBroken, setTilesBroken] = useState(false)

  useEffect(() => {
    if (!holder.current || map.current) return

    const instance = L.map(holder.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([35.3, -120.66], 11)

    // OpenStreetMap deprecated the {s} subdomain pattern; this is the URL they
    // currently document, and it fills tiles far more reliably.
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    })
    tiles.on('tileerror', () => setTilesBroken(true))
    tiles.addTo(instance)

    layers.current = L.layerGroup().addTo(instance)
    map.current = instance

    // Leaflet measures its container once at construction. In a grid that is
    // still settling, that measurement is wrong and the map renders at a
    // nonsense zoom, so re-measure whenever the container actually resizes.
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(holder.current)

    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
      layers.current = null
    }
  }, [])

  useEffect(() => {
    const group = layers.current
    if (!group) return
    group.clearLayers()

    for (const route of routes) {
      const line = L.polyline(
        [
          [route.from.lat, route.from.lng],
          [route.to.lat, route.to.lng],
        ],
        {
          color: route.color,
          weight: route.dimmed ? 3 : 5,
          opacity: route.dimmed ? 0.35 : 1,
          dashArray: route.dashed ? '8 7' : undefined,
        },
      )
      if (onSelectRoute) line.on('click', () => onSelectRoute(route.id))
      line.addTo(group)
    }

    for (const marker of markers) {
      const style = MARKER_STYLE[marker.kind]
      const dot = L.circleMarker([marker.at.lat, marker.at.lng], {
        radius: style.radius,
        color: style.stroke,
        weight: 2,
        fillColor: style.color,
        fillOpacity: 1,
      })
      if (marker.label) dot.bindTooltip(marker.label)
      if (onSelectMarker) {
        dot.on('click', () => onSelectMarker(marker.id))
        dot.getElement()?.setAttribute('role', 'button')
      }
      dot.addTo(group)
    }
  }, [routes, markers, onSelectRoute, onSelectMarker])

  useEffect(() => {
    const instance = map.current
    if (!instance || fit.length === 0) return

    const bounds = L.latLngBounds(fit.map((p) => [p.lat, p.lng] as [number, number]))
    if (!bounds.isValid()) return

    instance.invalidateSize()
    // Fitting a single point would otherwise drop straight to street level,
    // which tells the reader nothing about where the trip sits.
    instance.fitBounds(bounds, { padding: [48, 48], maxZoom: fit.length === 1 ? 10 : 13 })
  }, [fit])

  return (
    <div className="map-canvas">
      <div ref={holder} style={{ width: '100%', height: '100%' }} aria-hidden="true" />
      {tilesBroken ? (
        <div className="map-fallback" role="status">
          <strong>Map tiles could not load.</strong>
          <span>The matches beside this map still work.</span>
        </div>
      ) : null}
    </div>
  )
}
