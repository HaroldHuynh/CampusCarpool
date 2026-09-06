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

export type MapMarkerKind = 'origin' | 'destination' | 'meetup' | 'ride'

export type MapMarker = { id: string; at: LatLng; kind: MapMarkerKind; label?: string }

const MARKER_STYLE: Record<MapMarkerKind, { color: string; radius: number }> = {
  origin: { color: '#16372f', radius: 7 },
  destination: { color: '#ff705b', radius: 7 },
  meetup: { color: '#c7e34b', radius: 9 },
  ride: { color: '#16785d', radius: 6 },
}

export default function MapCanvas({
  routes,
  markers,
  fit,
  onSelectRoute,
}: {
  routes: MapRoute[]
  markers: MapMarker[]
  fit: LatLng[]
  onSelectRoute?: (id: string) => void
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

    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
        color: '#16372f',
        weight: 2,
        fillColor: style.color,
        fillOpacity: 1,
      })
      if (marker.label) dot.bindTooltip(marker.label)
      dot.addTo(group)
    }
  }, [routes, markers, onSelectRoute])

  useEffect(() => {
    const instance = map.current
    if (!instance || fit.length === 0) return

    const bounds = L.latLngBounds(fit.map((p) => [p.lat, p.lng] as [number, number]))
    if (!bounds.isValid()) return

    instance.invalidateSize()
    instance.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 })
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
