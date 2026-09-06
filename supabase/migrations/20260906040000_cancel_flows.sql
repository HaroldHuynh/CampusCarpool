-- Cancelling, for both sides of a ride.
--
-- Both go through SECURITY DEFINER functions rather than RLS delete policies,
-- to mirror reserve_ride_seat: releasing a seat has to put it back on the ride
-- in the same statement, or the seat count drifts.
--
-- Unlike the existing RPCs, these take no profile id from the caller — they
-- resolve it from auth.uid(). Trusting a passed-in id would let anyone cancel
-- on someone else's behalf by sending a different uuid.

create or replace function public.cancel_ride_seat(target_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  removed integer;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    raise exception 'Not signed in';
  end if;

  delete from public.ride_reservations
  where ride_id = target_ride_id and rider_profile_id = me;

  get diagnostics removed = row_count;

  if removed = 1 then
    -- Give the seat back. There is no stored capacity to cap against, so a
    -- driver who lowered seats_available after someone booked will see the
    -- count go one above what they set. Add a seats_total column if that
    -- matters later.
    update public.rides
    set seats_available = seats_available + 1
    where id = target_ride_id;
  end if;

  return removed = 1;
end;
$$;

grant execute on function public.cancel_ride_seat(uuid) to authenticated;

create or replace function public.cancel_ride(target_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  removed integer;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    raise exception 'Not signed in';
  end if;

  -- Reservations cascade; riders simply stop seeing the trip.
  delete from public.rides
  where id = target_ride_id
    and (driver_profile_id = me or driver_id = auth.uid());

  get diagnostics removed = row_count;

  return removed = 1;
end;
$$;

grant execute on function public.cancel_ride(uuid) to authenticated;

-- Closing your own open ride request from the profile page.
grant execute on function public.close_ride_request(bigint, uuid) to authenticated;
