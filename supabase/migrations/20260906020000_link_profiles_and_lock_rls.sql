-- Links campus_profiles (the durable identity used for ride history and
-- ratings) to auth.users, replacing the localStorage profile id the demo site
-- used. Everything else in the schema already works through SECURITY DEFINER
-- RPCs (reserve_ride_seat, rate_ride_user, close_ride_request), so no extra
-- write policies are needed on ride_reservations or user_ratings.

-- A. Link identity to profile ------------------------------------------------
alter table public.campus_profiles
  add column if not exists user_id uuid unique references auth.users (id) on delete cascade;

create or replace function public.my_profile_id()
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select id from public.campus_profiles where user_id = auth.uid()
$$;

grant execute on function public.my_profile_id() to authenticated;

-- Backfill a profile for every existing account that lacks one.
insert into public.campus_profiles (display_name, user_id)
select coalesce(nullif(trim(ar.full_name), ''), split_part(u.email, '@', 1)), u.id
from auth.users u
left join public.access_requests ar on ar.user_id = u.id
where not exists (
  select 1 from public.campus_profiles p where p.user_id = u.id
);

-- New accounts get a profile at signup, alongside the access request.
-- The @calpoly.edu rule is already enforced by the only_calpoly_users auth
-- hook, so it is deliberately not duplicated here.
create or replace function public.create_access_request_for_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  resolved_name text;
begin
  resolved_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(lower(new.email), '@', 1)
  );

  insert into public.access_requests (
    user_id, email, full_name, first_name, last_name, contact_method, contact_value
  )
  values (
    new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'contact_method',
    new.raw_user_meta_data ->> 'contact_value'
  )
  on conflict (user_id) do nothing;

  insert into public.campus_profiles (display_name, user_id)
  values (resolved_name, new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- B. Stop one rider taking every seat ----------------------------------------
-- reserve_ride_seat decrements seats_available but does not check whether the
-- rider already holds a seat, so without this the same person can drain a car.
alter table public.ride_reservations
  drop constraint if exists ride_reservations_one_per_rider;
alter table public.ride_reservations
  add constraint ride_reservations_one_per_rider unique (ride_id, rider_profile_id);

-- C. Protect reputation ------------------------------------------------------
-- "Profiles updateable" grants anon UPDATE with using(true), which means any
-- visitor can rename anyone and write rating_average directly.
revoke update (rating_average, rating_count) on public.campus_profiles from authenticated, anon;

-- D. Restore an admin --------------------------------------------------------
insert into public.app_admins (user_id)
select user_id from public.access_requests where email = 'bspeck@calpoly.edu'
on conflict do nothing;
