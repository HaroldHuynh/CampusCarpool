-- The post fields and exact coordinates are established by the preceding
-- 20260906110000_notes_places_reviews migration. This migration
-- adds profile review viewing and a relationship-aware profile card.
-- Contact details are shared only after the two people are connected by a
-- pending or accepted seat request. Reviews and aggregate ratings stay public.
create or replace function public.get_profile_card(target_profile_id uuid)
returns table (
  display_name text,
  rating_average numeric,
  rating_count integer,
  contact_method text,
  contact_value text,
  contact_available boolean
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  connected boolean;
begin
  select p.id into me from public.campus_profiles p where p.user_id = auth.uid();
  if me is null then raise exception 'Not signed in'; end if;

  select exists (
    select 1
    from public.ride_reservations rr
    join public.rides r on r.id = rr.ride_id
    where rr.status in ('pending', 'accepted')
      and ((r.driver_profile_id = me and rr.rider_profile_id = target_profile_id)
        or (r.driver_profile_id = target_profile_id and rr.rider_profile_id = me))
  ) into connected;

  return query
  select p.display_name, p.rating_average, p.rating_count,
    case when connected or target_profile_id = me then ar.contact_method else null end,
    case when connected or target_profile_id = me then ar.contact_value else null end,
    connected or target_profile_id = me
  from public.campus_profiles p
  left join public.access_requests ar on ar.user_id = p.user_id
  where p.id = target_profile_id;
end;
$$;

create or replace function public.get_profile_reviews(target_profile_id uuid)
returns table (id uuid, stars integer, created_at timestamptz, reviewer_name text)
language sql
stable
security definer
set search_path to ''
as $$
  select ur.id, ur.stars, ur.created_at, p.display_name
  from public.user_ratings ur
  join public.campus_profiles p on p.id = ur.rater_profile_id
  where ur.rated_profile_id = target_profile_id
  order by ur.created_at desc
$$;

grant execute on function public.get_profile_card(uuid) to authenticated;
grant execute on function public.get_profile_reviews(uuid) to authenticated;
