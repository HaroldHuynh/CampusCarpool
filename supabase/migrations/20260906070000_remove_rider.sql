-- A driver can drop one rider without calling off the whole trip.
--
-- Mirrors cancel_ride_seat from the other side: the seat only comes back if
-- that rider actually held one, so removing a still-pending request does not
-- invent a seat. The caller is resolved from auth.uid(), never from an id the
-- client sends.

create or replace function public.remove_rider(request_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  target_ride uuid;
  was_accepted boolean;
  removed integer;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    raise exception 'Not signed in';
  end if;

  -- Only the driver of the ride this seat belongs to.
  select rr.ride_id, rr.status = 'accepted'
    into target_ride, was_accepted
  from public.ride_reservations rr
  join public.rides r on r.id = rr.ride_id
  where rr.id = request_id and r.driver_profile_id = me;

  if target_ride is null then
    return false;
  end if;

  delete from public.ride_reservations where id = request_id;
  get diagnostics removed = row_count;

  if removed = 1 and coalesce(was_accepted, false) then
    update public.rides
    set seats_available = seats_available + 1
    where id = target_ride;
  end if;

  return removed = 1;
end;
$$;

grant execute on function public.remove_rider(uuid) to authenticated;
