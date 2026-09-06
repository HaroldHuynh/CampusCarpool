import { describe, expect, it } from 'vitest'
import { chooseMeetup, computePayoff, type Place } from './meetup'

const rider = { lat: 35.3, lng: -120.66 }
const onRoute = { lat: 35.295, lng: -120.655 }

const places: Place[] = [
  {
    id: 'transit',
    label: 'Downtown transit center',
    lat: 35.2955,
    lng: -120.6555,
    category: 'transit',
  },
  { id: 'far', label: 'Paso Robles park', lat: 35.63, lng: -120.69, category: 'public' },
]

describe('chooseMeetup', () => {
  it('snaps to a named place within range', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    expect(meetup.label).toBe('Downtown transit center')
  })

  it('falls back to the raw projection when nothing is in range', () => {
    const meetup = chooseMeetup(rider, onRoute, [places[1]])
    expect(meetup.label).toBeNull()
    expect(meetup.point).toEqual(onRoute)
  })

  it('falls back when given no places at all', () => {
    expect(chooseMeetup(rider, onRoute, []).label).toBeNull()
  })

  it('prefers a transit stop over an equally close other place', () => {
    const tie: Place[] = [
      { id: 'other', label: 'Some corner', lat: 35.2955, lng: -120.6555, category: 'other' },
      { id: 'stop', label: 'Bus stop', lat: 35.2955, lng: -120.6555, category: 'transit' },
    ]
    expect(chooseMeetup(rider, onRoute, tie).label).toBe('Bus stop')
  })

  it('reports a walking time from the rider origin', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    expect(meetup.walkMinutes).toBeGreaterThan(0)
    expect(Number.isInteger(meetup.walkMinutes)).toBe(true)
  })
})

describe('computePayoff', () => {
  it('reports minutes saved when the driver origin is far away', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    const payoff = computePayoff(rider, { lat: 35.1, lng: -120.6 }, meetup)
    expect(payoff.minutesSaved).not.toBeNull()
    expect(payoff.minutesSaved as number).toBeGreaterThanOrEqual(5)
  })

  it('suppresses a saving below the threshold', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    const payoff = computePayoff(rider, { lat: 35.2996, lng: -120.6596 }, meetup)
    expect(payoff.minutesSaved).toBeNull()
  })

  it('returns whole minutes', () => {
    const meetup = chooseMeetup(rider, onRoute, places)
    const payoff = computePayoff(rider, { lat: 35.1, lng: -120.6 }, meetup)
    expect(Number.isInteger(payoff.minutesSaved as number)).toBe(true)
  })
})
