import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchPlaces } from './geocode'

function mockFetch(body: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => vi.unstubAllGlobals())

const feature = {
  geometry: { coordinates: [-121.9289, 37.3639] },
  properties: { name: 'San Jose Airport', city: 'San Jose', osm_key: 'aeroway' },
}

describe('searchPlaces', () => {
  it('maps a Photon feature to lat, lng, label and category', async () => {
    mockFetch({ features: [feature] })
    const [result] = await searchPlaces('San Jose airport')
    expect(result).toEqual({
      lat: 37.3639,
      lng: -121.9289,
      label: 'San Jose Airport, San Jose',
      category: 'transit',
    })
  })

  it('sends no bias coordinates when none are given', async () => {
    const spy = mockFetch({ features: [] })
    await searchPlaces('anywhere')
    const url = String(spy.mock.calls[0][0])
    expect(url).not.toContain('lat=')
    expect(url).not.toContain('lon=')
  })

  it('biases the search toward a given point', async () => {
    const spy = mockFetch({ features: [] })
    await searchPlaces('San Jose airport', undefined, { lat: 35.3, lng: -120.66 })
    const url = String(spy.mock.calls[0][0])
    expect(url).toContain('lat=35.3')
    expect(url).toContain('lon=-120.66')
  })

  it('skips features with no usable label', async () => {
    mockFetch({ features: [{ geometry: { coordinates: [1, 2] }, properties: {} }] })
    expect(await searchPlaces('x')).toEqual([])
  })

  it('skips features with no coordinates', async () => {
    mockFetch({ features: [{ properties: { name: 'Nowhere', city: 'Void' } }] })
    expect(await searchPlaces('x')).toEqual([])
  })

  it('throws when the geocoder returns an error status', async () => {
    mockFetch({}, false)
    await expect(searchPlaces('x')).rejects.toThrow('503')
  })
})

describe('searchPlaces bias filtering', () => {
  it('drops a result on another continent when biased', async () => {
    mockFetch({
      features: [
        {
          geometry: { coordinates: [121.045, 12.362] },
          properties: { name: 'San Jose Airport', city: 'San Jose' },
        },
      ],
    })
    const results = await searchPlaces('San Jose airport', undefined, {
      lat: 35.3,
      lng: -120.66,
    })
    expect(results).toEqual([])
  })

  it('keeps a long but plausible in-state trip', async () => {
    mockFetch({
      features: [
        {
          geometry: { coordinates: [-121.7617, 38.5382] },
          properties: { name: 'UC Davis', city: 'Davis' },
        },
      ],
    })
    const results = await searchPlaces('UC Davis', undefined, { lat: 35.3, lng: -120.66 })
    expect(results).toHaveLength(1)
  })

  it('keeps far results when no bias is given', async () => {
    mockFetch({
      features: [
        {
          geometry: { coordinates: [121.045, 12.362] },
          properties: { name: 'San Jose Airport', city: 'San Jose' },
        },
      ],
    })
    expect(await searchPlaces('San Jose airport')).toHaveLength(1)
  })
})
