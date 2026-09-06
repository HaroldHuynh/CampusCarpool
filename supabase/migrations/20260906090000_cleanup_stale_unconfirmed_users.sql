-- Abandoned signups can leave an unconfirmed auth.users row without a matching
-- access_requests row. That row still reserves the email address, so later
-- signup attempts can fail before the confirmation trigger recreates the app
-- records. Clean only accounts that never confirmed, never signed in, and are
-- old enough that their OTP has expired.

create or replace function public.cleanup_stale_unconfirmed_users()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  deleted_count integer;
begin
  with stale_users as (
    select u.id
    from auth.users u
    where u.email_confirmed_at is null
      and u.last_sign_in_at is null
      and u.created_at < now() - interval '2 hours'
      and not exists (
        select 1
        from public.campus_profiles p
        where p.user_id = u.id
          and (
            exists (select 1 from public.rides r where r.driver_profile_id = p.id)
            or exists (
              select 1
              from public.ride_reservations rr
              where rr.rider_profile_id = p.id
            )
            or exists (
              select 1
              from public.ride_requests rq
              where rq.requester_profile_id = p.id
            )
            or exists (
              select 1
              from public.user_ratings ur
              where ur.rater_profile_id = p.id or ur.rated_profile_id = p.id
            )
          )
      )
  ),
  deleted_access_requests as (
    delete from public.access_requests ar
    using stale_users su
    where ar.user_id = su.id
  ),
  deleted_profiles as (
    delete from public.campus_profiles p
    using stale_users su
    where p.user_id = su.id
  ),
  deleted_users as (
    delete from auth.users u
    using stale_users su
    where u.id = su.id
    returning u.id
  )
  select count(*) into deleted_count from deleted_users;

  return deleted_count;
end;
$$;

revoke execute on function public.cleanup_stale_unconfirmed_users() from anon, authenticated, public;

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('cleanup-stale-unconfirmed-users');
exception
  when others then
    null;
end;
$$;

select cron.schedule(
  'cleanup-stale-unconfirmed-users',
  '15 * * * *',
  $$select public.cleanup_stale_unconfirmed_users();$$
);
