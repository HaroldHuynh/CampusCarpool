import { getSupabaseClient } from '../lib/supabase'

/**
 * seats_available is REMAINING seats, not capacity: reserve_ride_seat
 * decrements it as part of claiming a seat. Nothing here should recompute it
 * from the reservation count.
 */

export type Driver = {
  display_name: string
  rating_average: number
  rating_count: number
}

export type OfferedRide = {
  id: string
  origin: string
  destination: string
  departure_at: string
  seats_available: number
  price_per_seat: number
  driver_profile_id: string | null
  driver: Driver | null
  passengers: string[]
}

export type RideRequest = {
  id: number
  rider_name: string
  requester?: Driver | null
  contact_info: string
  origin: string
  destination: string
  departure_at: string
  price_offer: number
  requester_profile_id: string | null
  is_closed: boolean
}

export type CampusProfile = {
  id: string
  display_name: string
  rating_average: number
  rating_count: number
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** The signed-in user's campus profile — the identity used for ride history. */
export async function getMyProfile(): Promise<CampusProfile | null> {
  const supabase = getSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()

  if (!userData.user) {
    return null
  }

  const { data, error } = await supabase
    .from('campus_profiles')
    .select('id, display_name, rating_average, rating_count')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (error) {
    return null
  }

  return data
}

export async function fetchOfferedRides(): Promise<OfferedRide[]> {
  const { data, error } = await getSupabaseClient()
    .from('rides')
    .select(
      'id, origin, destination, departure_at, seats_available, price_per_seat, driver_profile_id, driver:campus_profiles!driver_profile_id(display_name, rating_average, rating_count), ride_reservations(rider_name)',
    )
    .gte('departure_at', new Date().toISOString())
    .order('departure_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    origin: row.origin as string,
    destination: row.destination as string,
    departure_at: row.departure_at as string,
    seats_available: Number(row.seats_available),
    price_per_seat: Number(row.price_per_seat),
    driver_profile_id: (row.driver_profile_id as string) ?? null,
    driver: one(row.driver as Driver | Driver[] | null),
    passengers: ((row.ride_reservations as { rider_name: string }[] | null) ?? []).map(
      (r) => r.rider_name,
    ),
  }))
}

export async function offerRide(input: {
  origin: string
  destination: string
  departureAt: string
  seatsAvailable: number
  pricePerSeat: number
}) {
  const supabase = getSupabaseClient()
  const { data: userData } = await supabase.auth.getUser()
  const profile = await getMyProfile()

  if (!userData.user || !profile) {
    throw new Error('Sign in to offer a ride.')
  }

  if (new Date(input.departureAt) <= new Date()) {
    throw new Error('Choose a future departure time.')
  }

  const { error } = await supabase.from('rides').insert({
    driver_id: userData.user.id,
    driver_profile_id: profile.id,
    origin: input.origin.trim(),
    destination: input.destination.trim(),
    departure_at: new Date(input.departureAt).toISOString(),
    seats_available: input.seatsAvailable,
    price_per_seat: input.pricePerSeat,
  })

  if (error) {
    throw error
  }
}

/**
 * Goes through the RPC rather than inserting directly: it decrements the seat
 * and writes the reservation in one statement, so two people clicking at once
 * cannot oversell the car. Returns false when the ride filled up first.
 */
export async function reserveSeat(rideId: string) {
  const profile = await getMyProfile()

  if (!profile) {
    throw new Error('Finish your profile before reserving.')
  }

  const { data, error } = await getSupabaseClient().rpc('reserve_ride_seat', {
    ride_id: rideId,
    reserving_rider_name: profile.display_name,
    reserving_profile_id: profile.id,
  })

  if (error) {
    throw error
  }

  return Boolean(data)
}

/** Releases a seat and puts it back on the ride, in one statement. */
export async function cancelSeat(rideId: string) {
  const { data, error } = await getSupabaseClient().rpc('cancel_ride_seat', {
    target_ride_id: rideId,
  })

  if (error) {
    throw error
  }

  return Boolean(data)
}

/** Driver cancels their own trip; reservations cascade away. */
export async function cancelRide(rideId: string) {
  const { data, error } = await getSupabaseClient().rpc('cancel_ride', {
    target_ride_id: rideId,
  })

  if (error) {
    throw error
  }

  return Boolean(data)
}

export async function fetchRideRequests(): Promise<RideRequest[]> {
  const { data, error } = await getSupabaseClient()
    .from('ride_requests')
    .select(
      'id, rider_name, contact_info, origin, destination, departure_at, price_offer, requester_profile_id, is_closed, requester:campus_profiles!requester_profile_id(display_name, rating_average, rating_count)',
    )
    .eq('is_closed', false)
    .gte('departure_at', new Date().toISOString())
    .order('departure_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...(row as unknown as RideRequest),
    requester: one(row.requester as Driver | Driver[] | null),
  }))
}

export async function postRideRequest(input: {
  contactInfo: string
  origin: string
  destination: string
  departureAt: string
  priceOffer: number
}) {
  const profile = await getMyProfile()

  if (!profile) {
    throw new Error('Finish your profile before posting.')
  }

  if (new Date(input.departureAt) <= new Date()) {
    throw new Error('Choose a future departure time.')
  }

  const { error } = await getSupabaseClient().from('ride_requests').insert({
    rider_name: profile.display_name,
    contact_info: input.contactInfo.trim(),
    origin: input.origin.trim(),
    destination: input.destination.trim(),
    departure_at: new Date(input.departureAt).toISOString(),
    price_offer: input.priceOffer,
    requester_profile_id: profile.id,
  })

  if (error) {
    throw error
  }
}

export async function closeRideRequest(requestId: number, profileId: string) {
  const { error } = await getSupabaseClient().rpc('close_ride_request', {
    request_id: requestId,
    closing_profile_id: profileId,
  })

  if (error) {
    throw error
  }
}

export type HistoryRide = {
  id: string
  origin: string
  destination: string
  departure_at: string
  seats_available: number
  price_per_seat: number
  driver_profile_id: string | null
  driver?: Driver | null
  ride_reservations?: { rider_name: string; rider_profile_id: string | null }[]
}

export async function fetchHistory(profileId: string) {
  const supabase = getSupabaseClient()

  const [offered, reservations, given, requests] = await Promise.all([
    supabase
      .from('rides')
      .select('*, ride_reservations(rider_name, rider_profile_id)')
      .eq('driver_profile_id', profileId)
      .order('departure_at'),
    supabase
      .from('ride_reservations')
      .select(
        'ride_id, rides(*, driver:campus_profiles!driver_profile_id(display_name, rating_average, rating_count))',
      )
      .eq('rider_profile_id', profileId),
    supabase.from('user_ratings').select('ride_id, rated_profile_id').eq('rater_profile_id', profileId),
    supabase
      .from('ride_requests')
      .select(
        'id, rider_name, contact_info, origin, destination, departure_at, price_offer, requester_profile_id, is_closed',
      )
      .eq('requester_profile_id', profileId)
      .eq('is_closed', false)
      .order('departure_at'),
  ])

  if (offered.error) {
    throw offered.error
  }

  if (reservations.error) {
    throw reservations.error
  }

  const reserved = (reservations.data ?? [])
    .map((row: Record<string, unknown>) => one(row.rides as HistoryRide | HistoryRide[] | null))
    .filter((row): row is HistoryRide => Boolean(row))

  const rated = new Set(
    ((given.data ?? []) as { ride_id: string; rated_profile_id: string }[]).map(
      (row) => `${row.ride_id}:${row.rated_profile_id}`,
    ),
  )

  return {
    offered: (offered.data ?? []) as HistoryRide[],
    reserved,
    rated,
    requests: (requests.data ?? []) as RideRequest[],
  }
}

export async function rateUser(rideId: string, raterId: string, ratedId: string, stars: number) {
  const { error } = await getSupabaseClient().rpc('rate_ride_user', {
    rating_ride_id: rideId,
    rater_id: raterId,
    rated_id: ratedId,
    star_value: stars,
  })

  if (error) {
    throw error
  }
}
