-- Seats become requests the driver approves, and rides gain a lifecycle.
--
-- Before this, reserving took a seat instantly and a ride had no state beyond
-- its departure time — there was no way to tell "nobody has left yet" from
-- "this trip happened", and a driver had no say in who rode with them.

-- Seat requests ---------------------------------------------------------------
-- Reused ride_reservations rather than a new table so existing ratings,
-- history and foreign keys keep working. Rows that predate this are accepted.
alter table public.ride_reservations
  add column if not exists status text not null default 'pending',
  add column if not exists responded_at timestamptz;

alter table public.ride_reservations
  drop constraint if exists ride_reservations_status_check;
alter table public.ride_reservations
  add constraint ride_reservations_status_check
  check (status in ('pending', 'accepted', 'declined'));

update public.ride_reservations set status = 'accepted' where responded_at is null and status = 'pending';

-- Ride lifecycle --------------------------------------------------------------
alter table public.rides
  add column if not exists status text not null default 'scheduled',
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.rides
  drop constraint if exists rides_status_check;
alter table public.rides
  add constraint rides_status_check
  check (status in ('scheduled', 'in_progress', 'completed', 'cancelled'));

-- Requesting a seat -----------------------------------------------------------
-- No seat is taken here; the count only moves when the driver accepts.
create or replace function public.request_seat(target_ride_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  ride record;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    raise exception 'Not signed in';
  end if;

  select * into ride from public.rides where id = target_ride_id;

  if ride is null then
    return 'missing';
  end if;

  if ride.driver_profile_id = me then
    return 'own_ride';
  end if;

  if ride.status <> 'scheduled' then
    return 'not_open';
  end if;

  if ride.seats_available < 1 then
    return 'full';
  end if;

  insert into public.ride_reservations (ride_id, rider_profile_id, rider_name, status)
  select target_ride_id, me, p.display_name, 'pending'
  from public.campus_profiles p
  where p.id = me
  on conflict (ride_id, rider_profile_id) do nothing;

  if not found then
    return 'already_requested';
  end if;

  return 'requested';
end;
$$;

grant execute on function public.request_seat(uuid) to authenticated;

-- Driver responds -------------------------------------------------------------
create or replace function public.respond_to_seat_request(request_id uuid, accept boolean)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  seats integer;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    raise exception 'Not signed in';
  end if;

  -- Only the driver of that ride may answer, and only once.
  if not exists (
    select 1
    from public.ride_reservations rr
    join public.rides r on r.id = rr.ride_id
    where rr.id = request_id and r.driver_profile_id = me and rr.status = 'pending'
  ) then
    return false;
  end if;

  if accept then
    -- Take the seat as part of the same statement so two approvals cannot
    -- oversell the last seat.
    update public.rides r
    set seats_available = r.seats_available - 1
    from public.ride_reservations rr
    where rr.id = request_id and r.id = rr.ride_id and r.seats_available > 0
    returning r.seats_available into seats;

    if seats is null then
      return false;
    end if;
  end if;

  update public.ride_reservations
  set status = case when accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = request_id;

  return true;
end;
$$;

grant execute on function public.respond_to_seat_request(uuid, boolean) to authenticated;

-- Starting and finishing ------------------------------------------------------
create or replace function public.set_ride_status(target_ride_id uuid, next_status text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  changed integer;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    raise exception 'Not signed in';
  end if;

  if next_status not in ('in_progress', 'completed', 'cancelled', 'scheduled') then
    raise exception 'Unknown ride status';
  end if;

  update public.rides
  set status = next_status,
      started_at = case
        when next_status = 'in_progress' then coalesce(started_at, now())
        when next_status = 'scheduled' then null
        else started_at
      end,
      completed_at = case
        when next_status = 'completed' then now()
        when next_status in ('scheduled', 'in_progress') then null
        else completed_at
      end
  where id = target_ride_id
    and (driver_profile_id = me or driver_id = auth.uid());

  get diagnostics changed = row_count;

  return changed = 1;
end;
$$;

grant execute on function public.set_ride_status(uuid, text) to authenticated;

-- Cancelling ------------------------------------------------------------------
-- Replaces the earlier version: a seat only returns if it was actually taken,
-- so withdrawing a pending request no longer invents a seat.
create or replace function public.cancel_ride_seat(target_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  was_accepted boolean;
  removed integer;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    raise exception 'Not signed in';
  end if;

  select status = 'accepted' into was_accepted
  from public.ride_reservations
  where ride_id = target_ride_id and rider_profile_id = me;

  delete from public.ride_reservations
  where ride_id = target_ride_id and rider_profile_id = me;

  get diagnostics removed = row_count;

  if removed = 1 and coalesce(was_accepted, false) then
    update public.rides
    set seats_available = seats_available + 1
    where id = target_ride_id;
  end if;

  return removed = 1;
end;
$$;

-- Rating ----------------------------------------------------------------------
-- Was keyed off departure time, so a trip that never happened could be rated.
-- Now the ride has to be marked completed, and only accepted riders count.
create or replace function public.rate_ride_user(
  rating_ride_id uuid, rater_id uuid, rated_id uuid, star_value integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if star_value not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  if not exists (select 1 from public.campus_profiles where id = rater_id and user_id = auth.uid()) then
    raise exception 'You can only rate as yourself.';
  end if;

  if not exists (
    select 1
    from public.rides r
    join public.ride_reservations rr on rr.ride_id = r.id and rr.status = 'accepted'
    where r.id = rating_ride_id
      and r.status = 'completed'
      and (
        (r.driver_profile_id = rater_id and rr.rider_profile_id = rated_id)
        or (r.driver_profile_id = rated_id and rr.rider_profile_id = rater_id)
      )
  ) then
    raise exception 'You can only rate people from completed rides you shared.';
  end if;

  insert into public.user_ratings (ride_id, rater_profile_id, rated_profile_id, stars)
  values (rating_ride_id, rater_id, rated_id, star_value);

  update public.campus_profiles p
  set rating_average = q.average, rating_count = q.total
  from (
    select round(avg(stars)::numeric, 1) average, count(*) total
    from public.user_ratings where rated_profile_id = rated_id
  ) q
  where p.id = rated_id;
end;
$$;
