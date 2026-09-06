import type { PlaceCategory } from './meetup'

export type GeocodeResult = {
  lat: number
  lng: number
  label: string
  category: PlaceCategory
}

const ENDPOINT = 'https://photon.komoot.io/api'

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, unknown>
}

function categoryOf(properties: Record<string, unknown>): PlaceCategory {
  const key = String(properties.osm_key ?? '')
  const value = String(properties.osm_value ?? '')
  if (key === 'railway' || key === 'aeroway' || value === 'bus_stop' || value === 'station') {
    return 'transit'
  }
  if (value === 'university' || value === 'college' || value === 'school') return 'campus'
  if (key === 'amenity' || key === 'leisure' || key === 'tourism') return 'public'
  return 'other'
}

/** "Dexter Lawn, San Luis Obispo" — stable enough to re-resolve from text. */
function labelOf(properties: Record<string, unknown>): string {
  const name = String(properties.name ?? '').trim()
  const area = String(properties.city ?? properties.county ?? properties.state ?? '').trim()
  if (name && area) return `${name}, ${area}`
  return name || area
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&limit=5`
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Geocoder returned ${response.status}`)
  }

  const body = (await response.json()) as { features?: PhotonFeature[] }

  return (body.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates
    const properties = feature.properties ?? {}
    const label = labelOf(properties)
    if (!coordinates || !label) return []
    return [{ lng: coordinates[0], lat: coordinates[1], label, category: categoryOf(properties) }]
  })
}
