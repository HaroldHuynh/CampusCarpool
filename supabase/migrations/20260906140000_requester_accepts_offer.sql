-- A driver offering on a ride request must not put the rider in the car.
--
-- offer_ride_for_request already created the seat as 'pending', but only the
-- ride's driver can answer a pending seat (respond_to_seat_request checks
-- driver_profile_id), so the driver was accepting their own offer on the
-- requester's behalf. It also closed the request straight away, so the rider
-- lost their listing before agreeing to anything.
--
-- Now: the offer stays pending, the request stays open, and the requester
-- decides.

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

  -- Pending, and no seat consumed: the rider has not agreed yet.
  insert into public.ride_reservations (ride_id, rider_profile_id, rider_name, status)
  values (new_ride_id, request_row.requester_profile_id, request_row.rider_name, 'pending');

  -- Point the request at the offer but leave it open, so the rider still has a
  -- listing if they turn this driver down.
  update public.ride_requests
  set matched_ride_id = new_ride_id
  where id = target_request_id;

  return new_ride_id;
end;
$$;

revoke execute on function public.offer_ride_for_request(bigint, integer, numeric) from anon, public;
grant execute on function public.offer_ride_for_request(bigint, integer, numeric) to authenticated;

-- The rider's side of that decision.
create or replace function public.respond_to_ride_offer(target_request_id bigint, accept boolean)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  request_row record;
  seats integer;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    raise exception 'Not signed in';
  end if;

  select * into request_row
  from public.ride_requests
  where id = target_request_id and requester_profile_id = me and matched_ride_id is not null
  for update;

  if request_row is null then
    return false;
  end if;

  if accept then
    -- Take the seat in the same statement, so a driver who filled the car
    -- elsewhere in the meantime cannot oversell it.
    update public.rides
    set seats_available = seats_available - 1
    where id = request_row.matched_ride_id and seats_available > 0
    returning seats_available into seats;

    if seats is null then
      return false;
    end if;

    update public.ride_reservations
    set status = 'accepted', responded_at = now()
    where ride_id = request_row.matched_ride_id and rider_profile_id = me;

    update public.ride_requests
    set is_closed = true
    where id = target_request_id;
  else
    -- Turning it down removes the seat and the ride that was created purely
    -- for this request, and frees the request for another driver.
    delete from public.ride_reservations
    where ride_id = request_row.matched_ride_id and rider_profile_id = me;

    delete from public.rides
    where id = request_row.matched_ride_id
      and not exists (
        select 1 from public.ride_reservations rr where rr.ride_id = request_row.matched_ride_id
      );

    update public.ride_requests
    set matched_ride_id = null
    where id = target_request_id;
  end if;

  return true;
end;
$$;

revoke execute on function public.respond_to_ride_offer(bigint, boolean) from anon, public;
grant execute on function public.respond_to_ride_offer(bigint, boolean) to authenticated;

-- Realtime: the client subscribes to these instead of polling behind a
-- refresh button.
do $$
declare
  t text;
begin
  foreach t in array array['rides', 'ride_requests', 'ride_reservations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
