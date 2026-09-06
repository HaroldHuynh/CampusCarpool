-- A ride is under way once its departure time passes. No driver has to press
-- start or finish, so the lifecycle buttons and the "under way" badge go away.
--
-- The status column stays (nothing is dropped) but is no longer the gate for
-- requesting or rating; departure time is. cancel_ride still deletes outright.

-- Requesting closes when the ride leaves, rather than when a driver flips a
-- status they no longer set.
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

  if ride.departure_at <= now() then
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

-- Rating opens once the trip has departed. Still restricted to riders the
-- driver accepted, and the rater still has to be who they claim to be.
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
      and r.departure_at < now()
      and (
        (r.driver_profile_id = rater_id and rr.rider_profile_id = rated_id)
        or (r.driver_profile_id = rated_id and rr.rider_profile_id = rater_id)
      )
  ) then
    raise exception 'You can only rate people from rides you shared.';
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

-- Anything left mid-flight from the manual flow goes back to scheduled so it
-- is judged purely on its departure time.
update public.rides set status = 'scheduled' where status = 'in_progress';
