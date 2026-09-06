-- Two additions: a note on each post and real coordinates for places.

-- Notes -----------------------------------------------------------------------
alter table public.rides add column if not exists note text;
alter table public.ride_requests add column if not exists note text;

alter table public.rides drop constraint if exists rides_note_length;
alter table public.rides add constraint rides_note_length check (note is null or char_length(note) <= 300);
alter table public.ride_requests drop constraint if exists ride_requests_note_length;
alter table public.ride_requests add constraint ride_requests_note_length check (note is null or char_length(note) <= 300);

-- Places ----------------------------------------------------------------------
-- Origin and destination were free text, so "Trinity" (a dorm) was geocoded
-- later with no context and resolved to the city of Trinity. Storing the
-- coordinates chosen at posting time removes the guesswork: the map plots what
-- the poster actually picked instead of re-interpreting their words.
alter table public.rides
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision;

alter table public.ride_requests
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision;

-- Sharing contact details -----------------------------------------------------
-- access_requests is readable only by its owner, so neither side of a confirmed
-- trip could reach the other. This exposes contact details for one ride, and
-- only to people actually on it: the driver, and riders whose seat was
-- accepted. A pending request reveals nothing.
create or replace function public.ride_contacts(target_ride_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  role text,
  contact_method text,
  contact_value text
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
begin
  select id into me from public.campus_profiles where user_id = auth.uid();

  if me is null then
    return;
  end if;

  if not exists (
    select 1 from public.rides r
    where r.id = target_ride_id
      and (
        r.driver_profile_id = me
        or exists (
          select 1 from public.ride_reservations rr
          where rr.ride_id = r.id and rr.rider_profile_id = me and rr.status = 'accepted'
        )
      )
  ) then
    return;
  end if;

  return query
  select p.id, p.display_name, 'driver'::text, ar.contact_method, ar.contact_value
  from public.rides r
  join public.campus_profiles p on p.id = r.driver_profile_id
  left join public.access_requests ar on ar.user_id = p.user_id
  where r.id = target_ride_id and p.id <> me

  union all

  select p.id, p.display_name, 'rider'::text, ar.contact_method, ar.contact_value
  from public.ride_reservations rr
  join public.campus_profiles p on p.id = rr.rider_profile_id
  left join public.access_requests ar on ar.user_id = p.user_id
  where rr.ride_id = target_ride_id and rr.status = 'accepted' and p.id <> me;
end;
$$;

revoke execute on function public.ride_contacts(uuid) from anon, public;
grant execute on function public.ride_contacts(uuid) to authenticated;
