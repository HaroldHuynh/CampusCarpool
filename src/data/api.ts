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

export type Review = {
  id: string
  stars: number
  created_at: string
  reviewer_name: string
}

export type ProfileCard = Driver & {
  contact_method: 'phone' | 'instagram' | null
  contact_value: string | null
  contact_available: boolean
  reviews: Review[]
}

export type RideStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
export type SeatStatus = 'pending' | 'accepted' | 'declined'

export type SeatRequest = {
  id: string
  rider_name: string
  rider_profile_id: string | null
  status: SeatStatus
  /** Who started it — decides which side a pending seat is waiting on. */
  initiated_by: 'rider' | 'driver'
}

export type OfferedRide = {
  id: string
  origin: string
  destination: string
  departure_at: string
  seats_available: number
  price_per_seat: number
  note: string | null
  origin_lat: number | null
  origin_lng: number | null
  destination_lat: number | null
  destination_lng: number | null
  driver_profile_id: string | null
  driver: Driver | null
  status: RideStatus
  started_at: string | null
  requests: SeatRequest[]
  /** The signed-in user's own seat request, if any. */
  mySeat: SeatRequest | null
}

export type RideRequest = {
  id: number
  rider_name: string
  requester?: Driver | null
  contact_info: string
  origin: string
  destination: string
  departure_at: string
  note: string | null
  origin_lat: number | null
  origin_lng: number | null
  destination_lat: number | null
  destination_lng: number | null
  requester_profile_id: string | null
  is_closed: boolean
  matched_ride_id?: string | null
}

export type CampusProfile = {
  id: string
  display_name: string
  rating_average: number
  rating_count: number
}

export type RideContact = {
  profile_id: string
  display_name: string
  contact_method: 'phone' | 'instagram' | null
  contact_value: string | null
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
      'id, origin, destination, departure_at, seats_available, price_per_seat, note, origin_lat, origin_lng, destination_lat, destination_lng, driver_profile_id, status, started_at, driver:campus_profiles!driver_profile_id(display_name, rating_average, rating_count), ride_reservations(id, rider_name, rider_profile_id, status, initiated_by)',
    )
    .gte('departure_at', new Date().toISOString())
    .order('departure_at', { ascending: true })

  if (error) {
    throw error
  }

  const me = await getMyProfile()

  return (data ?? []).map((row: Record<string, unknown>) => {
    const requests = ((row.ride_reservations as SeatRequest[] | null) ?? []).filter(
      (r) => r.status !== 'declined',
    )

    return {
    id: row.id as string,
    origin: row.origin as string,
    destination: row.destination as string,
    departure_at: row.departure_at as string,
    seats_available: Number(row.seats_available),
    price_per_seat: Number(row.price_per_seat),
    note: (row.note as string) ?? null,
    origin_lat: row.origin_lat === null ? null : Number(row.origin_lat),
    origin_lng: row.origin_lng === null ? null : Number(row.origin_lng),
    destination_lat: row.destination_lat === null ? null : Number(row.destination_lat),
    destination_lng: row.destination_lng === null ? null : Number(row.destination_lng),
    driver_profile_id: (row.driver_profile_id as string) ?? null,
    driver: one(row.driver as Driver | Driver[] | null),
    status: (row.status as RideStatus) ?? 'scheduled',
    started_at: (row.started_at as string) ?? null,
    requests,
    mySeat: me ? (requests.find((r) => r.rider_profile_id === me.id) ?? null) : null,
    }
  })
}

export async function offerRide(input: {
  origin: string
  destination: string
  departureAt: string
  seatsAvailable: number
  pricePerSeat: number
  note: string
  originPoint: { lat: number; lng: number } | null
  destinationPoint: { lat: number; lng: number } | null
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
    note: input.note.trim() || null,
    origin_lat: input.originPoint?.lat ?? null,
    origin_lng: input.originPoint?.lng ?? null,
    destination_lat: input.destinationPoint?.lat ?? null,
    destination_lng: input.destinationPoint?.lng ?? null,
  })

  if (error) {
    throw error
  }
}

/**
 * Asks the driver for a seat. No seat is taken until they accept, so two
 * people can both have a request in without overselling the car.
 */
export async function requestSeat(rideId: string) {
  const { data, error } = await getSupabaseClient().rpc('request_seat', {
    target_ride_id: rideId,
  })

  if (error) {
    throw error
  }

  return data as 'requested' | 'already_requested' | 'full' | 'own_ride' | 'not_open' | 'missing'
}

export async function fetchRideContacts(rideId: string): Promise<RideContact[]> {
  const { data, error } = await getSupabaseClient().rpc('get_ride_contacts', { target_ride_id: rideId })
  if (error) throw error
  return (data ?? []) as RideContact[]
}

/** Driver accepts or declines one seat request. */
export async function respondToSeatRequest(requestId: string, accept: boolean) {
  const { data, error } = await getSupabaseClient().rpc('respond_to_seat_request', {
    request_id: requestId,
    accept,
  })

  if (error) {
    throw error
  }

  return Boolean(data)
}

/** Driver drops one rider without calling off the trip. */
export async function removeRider(requestId: string) {
  const { data, error } = await getSupabaseClient().rpc('remove_rider', {
    request_id: requestId,
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
      'id, rider_name, contact_info, origin, destination, departure_at, note, origin_lat, origin_lng, destination_lat, destination_lng, requester_profile_id, is_closed, requester:campus_profiles!requester_profile_id(display_name, rating_average, rating_count)',
    )
    .eq('is_closed', false)
    .is('matched_ride_id', null)
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
  origin: string
  destination: string
  departureAt: string
  note: string
  originPoint: { lat: number; lng: number } | null
  destinationPoint: { lat: number; lng: number } | null
}) {
  const supabase = getSupabaseClient()
  const profile = await getMyProfile()

  if (!profile) {
    throw new Error('Finish your profile before posting.')
  }

  if (new Date(input.departureAt) <= new Date()) {
    throw new Error('Choose a future departure time.')
  }

  // Contact comes from the profile rather than being retyped each time.
  const { data: row } = await supabase
    .from('access_requests')
    .select('contact_value')
    .maybeSingle()

  const { error } = await supabase.from('ride_requests').insert({
    rider_name: profile.display_name,
    contact_info: (row?.contact_value as string) ?? '',
    origin: input.origin.trim(),
    destination: input.destination.trim(),
    departure_at: new Date(input.departureAt).toISOString(),
    price_offer: 0,
    note: input.note.trim() || null,
    origin_lat: input.originPoint?.lat ?? null,
    origin_lng: input.originPoint?.lng ?? null,
    destination_lat: input.destinationPoint?.lat ?? null,
    destination_lng: input.destinationPoint?.lng ?? null,
    requester_profile_id: profile.id,
  })

  if (error) {
    throw error
  }
}

export async function offerRideForRequest(input: {
  requestId: number
  seatsAvailable: number
  pricePerSeat: number
}) {
  const { data, error } = await getSupabaseClient().rpc('offer_ride_for_request', {
    target_request_id: input.requestId,
    offered_seats: input.seatsAvailable,
    offered_price: input.pricePerSeat,
  })
  if (error) throw error
  return data as string
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
  status: RideStatus
  started_at: string | null
  driver?: Driver | null
  ride_reservations?: SeatRequest[]
  mySeatStatus?: SeatStatus
  /** Who started my own seat, so the caller can tell an answer I gave from
   *  one I am being told about. */
  mySeatInitiatedBy?: 'rider' | 'driver'
}

export async function fetchHistory(profileId: string) {
  const supabase = getSupabaseClient()

  const [offered, reservations, given, requests] = await Promise.all([
    supabase
      .from('rides')
      .select('*, ride_reservations(id, rider_name, rider_profile_id, status, initiated_by)')
      .eq('driver_profile_id', profileId)
      .order('departure_at'),
    supabase
      .from('ride_reservations')
      .select(
        'ride_id, status, initiated_by, rides(*, driver:campus_profiles!driver_profile_id(display_name, rating_average, rating_count))',
      )
      .eq('rider_profile_id', profileId),
    supabase.from('user_ratings').select('ride_id, rated_profile_id').eq('rater_profile_id', profileId),
    supabase
      .from('ride_requests')
      .select(
        'id, rider_name, contact_info, origin, destination, departure_at, note, requester_profile_id, is_closed, matched_ride_id',
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

  // This enhancement is intentionally non-blocking: if a client reaches an
  // older database during a deployment, the rest of the profile still loads.
  const { data: matchedData } = await supabase
    .from('ride_requests')
    .select('id, origin, destination, matched_ride_id')
    .eq('requester_profile_id', profileId)
    .eq('is_closed', false)
    .not('matched_ride_id', 'is', null)

  // Carry my own seat status onto the ride so the caller can tell "waiting on
  // the driver" from "confirmed".
  const reserved = (reservations.data ?? [])
    .map((row: Record<string, unknown>) => {
      const ride = one(row.rides as HistoryRide | HistoryRide[] | null)

      return ride
        ? {
            ...ride,
            mySeatStatus: row.status as SeatStatus,
            mySeatInitiatedBy: row.initiated_by as 'rider' | 'driver',
          }
        : null
    })
    .filter((row): row is HistoryRide & { mySeatStatus: SeatStatus } => Boolean(row))

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
    matchedOffers: (matchedData ?? []) as Pick<
      RideRequest,
      'id' | 'origin' | 'destination' | 'matched_ride_id'
    >[],
  }
}

/** The rider answers a driver's offer on their request. */
export async function respondToRideOffer(requestId: number, accept: boolean) {
  const { data, error } = await getSupabaseClient().rpc('respond_to_ride_offer', {
    target_request_id: requestId,
    accept,
  })

  if (error) {
    throw error
  }

  return Boolean(data)
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

export async function fetchProfileCard(profileId: string): Promise<ProfileCard> {
  const { data, error } = await getSupabaseClient().rpc('get_profile_card', {
    target_profile_id: profileId,
  })
  if (error) throw error

  const row = one(data as Omit<ProfileCard, 'reviews'> | Omit<ProfileCard, 'reviews'>[] | null)
  if (!row) throw new Error('Profile is unavailable.')

  const { data: reviews, error: reviewsError } = await getSupabaseClient().rpc('get_profile_reviews', {
    target_profile_id: profileId,
  })
  if (reviewsError) throw reviewsError

  return { ...row, reviews: (reviews ?? []) as Review[] }
}
