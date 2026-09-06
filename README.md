# CampusCarpool

React + TypeScript + Vite front end for CampusCarpool, backed by Supabase.

Cal Poly students sign in, post ride requests, offer seats on trips they're
already driving, reserve seats, and rate each other afterwards.

## Setup

```sh
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```sh
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Then:

```sh
npm run dev
```

## How it fits together

| Layer | Where |
| --- | --- |
| Auth (sign in, sign up, email code) | `src/auth/auth.ts` |
| Supabase client | `src/lib/supabase.ts` |
| Data access | `src/data/api.ts` |
| Pages | `src/pages/` |
| Design system (from the DemoSite branch) | `src/styles/campus.css` |

### Identity

There are two related records per person:

- **`auth.users`** — the login.
- **`campus_profiles`** — the durable identity: display name, rating average
  and count. Rides and reservations point at this, so history survives.

They are joined by `campus_profiles.user_id`, and `public.my_profile_id()`
resolves the signed-in user's profile inside RLS policies. A profile is created
automatically at signup by the `create_access_request_for_new_user` trigger.

This replaced the earlier `localStorage` profile id, which anyone could mint or
edit, so names and ratings could be spoofed.

### Auth flow

1. Enter `@calpoly.edu` email and a password.
2. New accounts also give first name, last name, and a contact method (phone or
   Instagram).
3. Supabase emails a 6-digit code; entering it confirms the account.
4. Accounts that predate the profile columns get a "Finish your account" step.

The `@calpoly.edu` rule is enforced by the `only_calpoly_users` auth hook, not
just by the form — the client check alone is bypassable.

Supabase email confirmations must stay enabled. The app expects the signup OTP
to confirm the account, and that confirmation is what creates the matching
`access_requests` row. A scheduled cleanup removes abandoned, unconfirmed Auth
users after 2 hours so a half-finished signup does not permanently reserve the
email address.

For hosted Supabase, mirror the local auth settings in the dashboard: enable
email confirmations, configure a production SMTP provider, and keep the hourly
email limit high enough for signup testing. The local `supabase/config.toml`
does not automatically change hosted Auth settings.

If a user needs to be removed manually, delete the Supabase Auth user. Deleting
only `access_requests` can leave an Auth row behind, which blocks future signup
attempts for that email.

## Writes go through RPCs

Reserving and rating do **not** insert directly:

- `reserve_ride_seat(...)` decrements `rides.seats_available` and writes the
  reservation in one statement, so two people clicking at once cannot oversell
  the same seat. It returns `false` if the ride filled up first.
- `rate_ride_user(...)` records a rating and updates the profile's average.
- `close_ride_request(...)` closes a request the caller owns.
- `update_my_profile(...)` edits only profile columns, so `status` stays out of
  reach of the client.

**`rides.seats_available` is remaining seats, not capacity.** It is decremented
on reservation; do not recompute it from the reservation count.

## Database

Migrations are in `supabase/migrations/`, newest last. Apply them with the
Supabase SQL editor, or:

```sh
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## Checks

```sh
npm run lint
npm run build
```

## Known gaps

- `rides` and `ride_requests` still allow `anon` INSERT with no ownership
  check, because the standalone `DemoSite` pages post anonymously. Once that
  site is retired, drop the duplicate permissive policies so only the
  ownership-checked ones remain.
- There is no "cancel reservation" flow yet; cancelling needs an RPC that
  increments `seats_available` back, to mirror `reserve_ride_seat`.
