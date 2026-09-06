-- DEMO RESET — wipes all account and ride data.
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- DESTRUCTIVE and irreversible. Only run against the demo project.

begin;

-- Ride + messaging data (child rows first; cascade covers any stragglers).
truncate
  public.direct_messages,
  public.user_ratings,
  public.ride_reservations,
  public.ride_requests,
  public.rides
  restart identity cascade;

-- Every account. Cascades to public.campus_profiles and public.access_requests
-- via their `on delete cascade` foreign keys.
delete from auth.users;

commit;

-- To keep the seeded test accounts instead, replace the delete above with:
--   delete from auth.users
--   where email not in (
--     'driver.test@calpoly.edu',
--     'rider.test@calpoly.edu',
--     'rider2.test@calpoly.edu'
--   );
--
-- Re-seed test accounts afterward by running supabase/seed_test_accounts.sql.
