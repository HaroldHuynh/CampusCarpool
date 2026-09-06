-- A pending seat has two very different meanings and nothing distinguished
-- them, so the driver's board said "1 awaiting you" for both:
--
--   rider asked for a seat   -> the driver has to answer
--   driver offered on a request -> the rider has to answer
--
-- Recording who started it lets each side be told what it is actually waiting
-- on. Existing rows were all rider-initiated, which the default covers.

alter table public.ride_reservations
  add column if not exists initiated_by text not null default 'rider';

alter table public.ride_reservations drop constraint if exists ride_reservations_initiated_by_check;
alter table public.ride_reservations
  add constraint ride_reservations_initiated_by_check check (initiated_by in ('rider', 'driver'));

-- Mark seats created by a driver's offer, including any already in flight.
update public.ride_reservations rr
set initiated_by = 'driver'
from public.ride_requests req
where req.matched_ride_id = rr.ride_id
  and req.requester_profile_id = rr.rider_profile_id;

create or replace function public.offer_ride_for_request(
  target_request_id bigint, offered_seats integer, offered_price numeric
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  request_row record;
  new_ride_id uuid;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    raise exception 'Not signed in';
  end if;

  if offered_seats < 1 or offered_seats > 8 then
    raise exception 'Seats must be between 1 and 8';
  end if;

  if offered_price < 0 or offered_price > 1000 then
    raise exception 'Price must be between 0 and 1000';
  end if;

  select * into request_row
  from public.ride_requests
  where id = target_request_id and not is_closed and departure_at > now()
  for update;

  if request_row is null then
    raise exception 'That request is no longer available';
  end if;

  if request_row.requester_profile_id = me then
    raise exception 'You cannot offer a ride to yourself';
  end if;

  if request_row.matched_ride_id is not null then
    raise exception 'Someone has already offered this rider a ride';
  end if;

  insert into public.rides (
    driver_id, driver_profile_id, origin, destination, departure_at,
    seats_available, price_per_seat,
    origin_lat, origin_lng, destination_lat, destination_lng
  )
  values (
    auth.uid(), me, request_row.origin, request_row.destination, request_row.departure_at,
    offered_seats, offered_price,
    request_row.origin_lat, request_row.origin_lng,
    request_row.destination_lat, request_row.destination_lng
  )
  returning id into new_ride_id;

  insert into public.ride_reservations (ride_id, rider_profile_id, rider_name, status, initiated_by)
  values (new_ride_id, request_row.requester_profile_id, request_row.rider_name, 'pending', 'driver');

  update public.ride_requests
  set matched_ride_id = new_ride_id
  where id = target_request_id;

  return new_ride_id;
end;
$$;

revoke execute on function public.offer_ride_for_request(bigint, integer, numeric) from anon, public;
grant execute on function public.offer_ride_for_request(bigint, integer, numeric) to authenticated;
