/** Mirrors public.rides, plus a reservation count joined in by the client. */
export type Ride = {
  id: string
  origin: string
  destination: string
  /** ISO 8601 departure timestamp (rides.departure_at). */
  departsAt: string
  /** rides.seats_available */
  seatsAvailable: number
  /** Number of rows in ride_reservations for this ride. */
  seatsTaken: number
  /** rides.price_per_seat */
  pricePerSeat: number
  /**
   * Other members' display names are not readable: access_requests is
   * restricted to the signed-in user's own row, and there is no public
   * profile table. Null until the team adds one.
   */
  driverName: string | null
  /** The signed-in user is the driver. */
  isMine: boolean
  /** The signed-in user already holds a seat. */
  hasReserved: boolean
}

export type RideFilterState = {
  query: string
  origin: string
  earliestDate: string
  maxCost: string
  minSeats: string
}

export const EMPTY_FILTERS: RideFilterState = {
  query: '',
  origin: '',
  earliestDate: '',
  maxCost: '',
  minSeats: '',
}
