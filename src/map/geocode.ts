import { haversineKm } from './geometry'
import type { PlaceCategory } from './meetup'

export type GeocodeResult = {
  lat: number
  lng: number
  label: string
  category: PlaceCategory
}

const ENDPOINT = 'https://photon.komoot.io/api'

/**
 * Generous enough for any realistic carpool — San Luis Obispo to Davis is about
 * 400 km — while still discarding a same-named place on another continent.
 */
const MAX_BIAS_KM = 1000

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

/**
 * `bias` matters more than it looks: unbiased, "San Jose airport" resolves to
 * San Jose in the Philippines, not California. Passing a nearby point pulls
 * results toward where the rider actually is.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  bias?: { lat: number; lng: number },
): Promise<GeocodeResult[]> {
  const nearby = bias ? `&lat=${bias.lat}&lon=${bias.lng}` : ''
  const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&limit=5${nearby}`
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

    const result = {
      lng: coordinates[0],
      lat: coordinates[1],
      label,
      category: categoryOf(properties),
    }

    // Photon's own bias is only a ranking nudge: unbiased or not, "San Jose
    // airport" still returns San Jose, Mindoro ahead of California. Dropping
    // far-flung hits is what actually keeps a demo on the right continent.
    if (bias && haversineKm(bias, result) > MAX_BIAS_KM) return []

    return [result]
  })
}
