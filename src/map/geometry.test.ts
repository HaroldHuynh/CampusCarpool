import { describe, expect, it } from 'vitest'
import { haversineKm, projectOntoSegment } from './geometry'

const SLO = { lat: 35.3, lng: -120.66 }
const PASO = { lat: 35.63, lng: -120.69 }

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(SLO, SLO)).toBe(0)
  })

  it('measures SLO to Paso Robles at roughly 37 km', () => {
    expect(haversineKm(SLO, PASO)).toBeGreaterThan(35)
    expect(haversineKm(SLO, PASO)).toBeLessThan(39)
  })

  it('is symmetric', () => {
    expect(haversineKm(SLO, PASO)).toBeCloseTo(haversineKm(PASO, SLO), 6)
  })
})

describe('projectOntoSegment', () => {
  it('puts a point on the segment at its own position', () => {
    const mid = { lat: 35.465, lng: -120.675 }
    const result = projectOntoSegment(mid, SLO, PASO)
    expect(result.t).toBeGreaterThan(0.4)
    expect(result.t).toBeLessThan(0.6)
    expect(result.distanceKm).toBeLessThan(1)
  })

  it('reports t below zero for a point behind the start', () => {
    const behind = { lat: 35.2, lng: -120.65 }
    expect(projectOntoSegment(behind, SLO, PASO).t).toBeLessThan(0)
  })

  it('reports t above one for a point beyond the end', () => {
    const beyond = { lat: 35.8, lng: -120.7 }
    expect(projectOntoSegment(beyond, SLO, PASO).t).toBeGreaterThan(1)
  })

  it('clamps the returned point to the segment', () => {
    const behind = { lat: 35.2, lng: -120.65 }
    const result = projectOntoSegment(behind, SLO, PASO)
    expect(result.point.lat).toBeCloseTo(SLO.lat, 4)
    expect(result.point.lng).toBeCloseTo(SLO.lng, 4)
  })

  it('measures perpendicular offset from the segment', () => {
    const offset = { lat: 35.465, lng: -120.5 }
    expect(projectOntoSegment(offset, SLO, PASO).distanceKm).toBeGreaterThan(10)
  })

  it('handles a zero-length segment without dividing by zero', () => {
    const result = projectOntoSegment(PASO, SLO, SLO)
    expect(Number.isFinite(result.t)).toBe(true)
    expect(Number.isFinite(result.distanceKm)).toBe(true)
  })
})
