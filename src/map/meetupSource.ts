import { SEED_PLACES } from './locations'
import type { Place } from './meetup'

export { chooseMeetup, computePayoff } from './meetup'

/**
 * Joins the pure meetup math to the seed table. Keeping this in its own module
 * lets `meetup.ts` stay free of the location import, so the two can be tested
 * and reasoned about independently.
 */
export const SEED_PLACES_AS_MEETUPS: Place[] = SEED_PLACES
