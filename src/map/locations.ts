import { searchPlaces } from './geocode'
import type { Place } from './meetup'

export type ResolvedLocation = { lat: number; lng: number; label: string }

export type ResolveDeps = {
  search?: typeof searchPlaces
  storage?: Storage | null
  /** Keeps ambiguous names near a known point — see searchPlaces. */
  bias?: { lat: number; lng: number } | null
}

/** Shortest string allowed to match on a word prefix rather than exactly. */
const MIN_PREFIX_LENGTH = 4

/**
 * Versioned: a cached answer outlives the bug that produced it. Bumping this
 * retires every stored coordinate — "SF" was cached as Sfax, Tunisia before
 * alias matching landed, and no amount of fixing the lookup evicts that.
 */
const CACHE_PREFIX = 'cc.geo.v2.'

/**
 * Seed places cover several campuses on purpose: CampusCarpool is not tied to
 * one school, and these make the common demo paths work with no network.
 */
export const SEED_PLACES: Place[] = [
  {
    id: 'calpoly',
    label: 'Cal Poly San Luis Obispo',
    lat: 35.305,
    lng: -120.6625,
    category: 'campus',
    aliases: ['cal poly', 'calpoly'],
  },
  { id: 'dexter', label: 'Dexter Lawn, San Luis Obispo', lat: 35.3009, lng: -120.6625, category: 'campus' },
  {
    id: 'poly-canyon-village',
    label: 'Poly Canyon Village, San Luis Obispo',
    lat: 35.3145,
    lng: -120.6658,
    category: 'campus',
    aliases: ['pcv', 'poly canyon village', 'pvc'],
  },
  {
    id: 'trinity',
    label: 'Trinity Hall, San Luis Obispo',
    lat: 35.3029,
    lng: -120.6601,
    category: 'campus',
    aliases: ['trinity', 'trinity hall', 'trinity dorm', 'pyt trinity'],
  },
  {
    id: 'slo-transit',
    label: 'SLO Transit Center',
    lat: 35.2793,
    lng: -120.664,
    category: 'transit',
    aliases: ['slo', 'san luis obispo'],
  },
  {
    id: 'sf',
    label: 'San Francisco',
    lat: 37.7749,
    lng: -122.4194,
    category: 'public',
    aliases: ['sf', 'san fran', 'the city'],
  },
  {
    id: 'la',
    label: 'Los Angeles',
    lat: 34.0522,
    lng: -118.2437,
    category: 'public',
    aliases: ['la', 'l.a.'],
  },
  {
    id: 'sb',
    label: 'Santa Barbara',
    lat: 34.4208,
    lng: -119.6982,
    category: 'public',
    aliases: ['sb', 'santa barbara'],
  },
  {
    id: 'sj',
    label: 'San Jose',
    lat: 37.3382,
    lng: -121.8863,
    category: 'public',
    aliases: ['sj', 'san jose'],
  },
  { id: 'slo-amtrak', label: 'San Luis Obispo Amtrak', lat: 35.2751, lng: -120.6552, category: 'transit' },
  { id: 'sbp', label: 'San Luis Obispo airport', lat: 35.2368, lng: -120.6424, category: 'transit' },
  { id: 'pismo', label: 'Pismo Beach', lat: 35.1428, lng: -120.6413, category: 'public' },
  { id: 'santa-maria', label: 'Santa Maria', lat: 34.953, lng: -120.4357, category: 'public' },
  { id: 'paso', label: 'Paso Robles', lat: 35.6266, lng: -120.691, category: 'public' },
  { id: 'atascadero', label: 'Atascadero', lat: 35.4894, lng: -120.6707, category: 'public' },
  { id: 'gilroy', label: 'Gilroy', lat: 37.0058, lng: -121.5683, category: 'public' },
  { id: 'sjc', label: 'San Jose airport', lat: 37.3639, lng: -121.9289, category: 'transit' },
  { id: 'sj-diridon', label: 'San Jose Diridon Station', lat: 37.3297, lng: -121.9028, category: 'transit' },
  { id: 'sfo', label: 'San Francisco airport', lat: 37.6213, lng: -122.379, category: 'transit' },
  { id: 'ucdavis', label: 'UC Davis', lat: 38.5382, lng: -121.7617, category: 'campus' },
  { id: 'ucla', label: 'UCLA', lat: 34.0689, lng: -118.4452, category: 'campus' },
  { id: 'ucsb', label: 'UC Santa Barbara', lat: 34.414, lng: -119.8489, category: 'campus' },
  { id: 'umich', label: 'University of Michigan', lat: 42.278, lng: -83.7382, category: 'campus' },
  { id: 'alameda', label: 'Alameda', lat: 37.7652, lng: -122.2416, category: 'public' },
  { id: 'lax', label: 'Los Angeles airport', lat: 33.9416, lng: -118.4085, category: 'transit' },
]

const memoryCache = new Map<string, ResolvedLocation | null>()

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

function readStorage(storage: Storage | null, key: string): ResolvedLocation | undefined {
  if (!storage) return undefined
  try {
    const raw = storage.getItem(CACHE_PREFIX + key)
    return raw ? (JSON.parse(raw) as ResolvedLocation) : undefined
  } catch {
    return undefined
  }
}

function writeStorage(storage: Storage | null, key: string, value: ResolvedLocation): void {
  if (!storage) return
  try {
    storage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {
    // A full or disabled store is not worth failing a lookup over.
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function clearLocationCache(): void {
  memoryCache.clear()
}

/**
 * Exact label, then exact alias, then a whole-word prefix. Plain `includes`
 * was far too eager: "LA" matched "Dexter Lawn" on the "la" inside "Lawn",
 * so a ride to Los Angeles was drawn two streets from campus.
 */
function findSeed(key: string): Place | undefined {
  const exact = SEED_PLACES.find((place) => normalize(place.label) === key)
  if (exact) return exact

  const aliased = SEED_PLACES.find((place) =>
    (place.aliases ?? []).some((alias) => normalize(alias) === key),
  )
  if (aliased) return aliased

  if (key.length < MIN_PREFIX_LENGTH) return undefined

  return SEED_PLACES.find((place) =>
    normalize(place.label)
      .split(/[^a-z0-9]+/)
      .some((word) => word.startsWith(key)),
  )
}

/**
 * Text to coordinates, cheapest source first: session memory, then persisted
 * cache, then the bundled seed table, then the geocoder. Never throws — an
 * unresolvable ride is simply left off the map.
 */
export async function resolveLocation(
  text: string,
  deps: ResolveDeps = {},
): Promise<ResolvedLocation | null> {
  const key = normalize(text)
  if (!key) return null

  if (memoryCache.has(key)) return memoryCache.get(key) ?? null

  const storage = deps.storage === undefined ? defaultStorage() : deps.storage
  const cached = readStorage(storage, key)
  if (cached) {
    memoryCache.set(key, cached)
    return cached
  }

  const seed = findSeed(key)
  if (seed) {
    const resolved = { lat: seed.lat, lng: seed.lng, label: seed.label }
    memoryCache.set(key, resolved)
    return resolved
  }

  const search = deps.search ?? searchPlaces
  try {
    const [first] = await search(text, undefined, deps.bias ?? undefined)
    if (!first) {
      memoryCache.set(key, null)
      return null
    }
    const resolved = { lat: first.lat, lng: first.lng, label: first.label }
    memoryCache.set(key, resolved)
    writeStorage(storage, key, resolved)
    return resolved
  } catch {
    return null
  }
}
