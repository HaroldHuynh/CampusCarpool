import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLocationCache, resolveLocation, SEED_PLACES } from './locations'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k)
    },
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  } as Storage
}

beforeEach(() => clearLocationCache())

describe('SEED_PLACES', () => {
  it('covers more than one campus region', () => {
    const lngs = new Set(SEED_PLACES.map((p) => Math.round(p.lng)))
    expect(lngs.size).toBeGreaterThan(1)
  })

  it('gives every place a unique id', () => {
    expect(new Set(SEED_PLACES.map((p) => p.id)).size).toBe(SEED_PLACES.length)
  })
})

describe('resolveLocation', () => {
  it('resolves a seed place without touching the network', async () => {
    const search = vi.fn()
    const result = await resolveLocation('Cal Poly', { search, storage: memoryStorage() })
    expect(result).not.toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('matches seed places case-insensitively and ignoring surrounding space', async () => {
    const search = vi.fn()
    const result = await resolveLocation('  cal poly  ', { search, storage: memoryStorage() })
    expect(result).not.toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('falls back to the geocoder for unknown text', async () => {
    const search = vi.fn().mockResolvedValue([
      { lat: 42.28, lng: -83.74, label: 'Ann Arbor city hall', category: 'public' },
    ])
    const result = await resolveLocation('Ann Arbor city hall', {
      search,
      storage: memoryStorage(),
    })
    expect(result?.label).toBe('Ann Arbor city hall')
    expect(search).toHaveBeenCalledOnce()
  })

  it('caches a geocoded result so the second call skips the network', async () => {
    const search = vi.fn().mockResolvedValue([
      { lat: 42.28, lng: -83.74, label: 'Ann Arbor city hall', category: 'public' },
    ])
    const storage = memoryStorage()
    await resolveLocation('Ann Arbor city hall', { search, storage })
    clearLocationCache()
    await resolveLocation('Ann Arbor city hall', { search, storage })
    expect(search).toHaveBeenCalledOnce()
  })

  it('returns null when the geocoder finds nothing', async () => {
    const search = vi.fn().mockResolvedValue([])
    expect(await resolveLocation('qqzzxx', { search, storage: memoryStorage() })).toBeNull()
  })

  it('returns null instead of throwing when the geocoder fails', async () => {
    const search = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await resolveLocation('somewhere', { search, storage: memoryStorage() })).toBeNull()
  })

  it('returns null for empty text', async () => {
    const search = vi.fn()
    expect(await resolveLocation('   ', { search, storage: memoryStorage() })).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('works when storage is unavailable', async () => {
    const search = vi.fn().mockResolvedValue([
      { lat: 1, lng: 2, label: 'Somewhere', category: 'other' },
    ])
    expect(await resolveLocation('somewhere', { search, storage: null })).not.toBeNull()
  })
})

describe('resolveLocation abbreviations and loose matching', () => {
  it('resolves LA to Los Angeles, not a place whose name merely contains "la"', async () => {
    const search = vi.fn()
    const result = await resolveLocation('LA', { search, storage: memoryStorage() })
    expect(result?.label).toContain('Los Angeles')
    expect(search).not.toHaveBeenCalled()
  })

  it('resolves SF to San Francisco rather than geocoding it', async () => {
    const search = vi.fn()
    const result = await resolveLocation('SF', { search, storage: memoryStorage() })
    expect(result?.label).toContain('San Francisco')
    expect(search).not.toHaveBeenCalled()
  })

  it('resolves SLO to San Luis Obispo', async () => {
    const search = vi.fn()
    const result = await resolveLocation('SLO', { search, storage: memoryStorage() })
    expect(result?.lat).toBeGreaterThan(35)
    expect(result?.lat).toBeLessThan(35.5)
  })

  it('keeps the Trinity dorm alias on the Cal Poly map instead of geocoding a distant Trinity', async () => {
    const search = vi.fn()
    const result = await resolveLocation('pyt trinity', { search, storage: memoryStorage() })
    expect(result?.label).toBe('Trinity Hall, San Luis Obispo')
    expect(search).not.toHaveBeenCalled()
  })

  it('does not match a fragment in the middle of a word', async () => {
    const search = vi.fn().mockResolvedValue([])
    await resolveLocation('exte', { search, storage: memoryStorage() })
    expect(search).toHaveBeenCalled()
  })

  it('still matches on a whole word prefix', async () => {
    const search = vi.fn()
    const result = await resolveLocation('Dexter', { search, storage: memoryStorage() })
    expect(result?.label).toContain('Dexter Lawn')
    expect(search).not.toHaveBeenCalled()
  })

  it('passes a bias through to the geocoder', async () => {
    const search = vi.fn().mockResolvedValue([])
    await resolveLocation('somewhere odd', {
      search,
      storage: memoryStorage(),
      bias: { lat: 35.3, lng: -120.66 },
    })
    expect(search).toHaveBeenCalledWith('somewhere odd', undefined, { lat: 35.3, lng: -120.66 })
  })
})
