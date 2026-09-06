-- Only create a person's records once they have proved they own the address.
--
-- The trigger fired on INSERT into auth.users, which happens at signup —
-- before the emailed code is entered. An address that was never confirmed
-- still got an access_requests row (status 'approved' by default) and a
-- publicly readable campus_profiles row. Moving to confirmation time means an
-- abandoned signup leaves nothing behind but the unconfirmed auth row, which
-- still reserves the email so nobody else can take it.

drop trigger if exists on_auth_user_created_create_request on auth.users;
drop trigger if exists on_auth_user_confirmed_create_request on auth.users;
drop trigger if exists on_auth_user_created_confirmed on auth.users;

-- Same body as before; only when it runs changes.
create trigger on_auth_user_confirmed_create_request
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.create_access_request_for_new_user();

-- Covers accounts created already-confirmed (e.g. from the dashboard), which
-- never receive the UPDATE above.
create trigger on_auth_user_created_confirmed
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.create_access_request_for_new_user();

-- Clear records that only exist because of the old timing. Profiles that are
-- already referenced by a ride, reservation or rating are left alone so no
-- history is broken.
delete from public.campus_profiles p
where p.user_id in (select id from auth.users where email_confirmed_at is null)
  and not exists (select 1 from public.rides r where r.driver_profile_id = p.id)
  and not exists (select 1 from public.ride_reservations rr where rr.rider_profile_id = p.id)
  and not exists (select 1 from public.ride_requests rq where rq.requester_profile_id = p.id)
  and not exists (
    select 1 from public.user_ratings ur
    where ur.rater_profile_id = p.id or ur.rated_profile_id = p.id
  );

delete from public.access_requests
where user_id in (select id from auth.users where email_confirmed_at is null);
