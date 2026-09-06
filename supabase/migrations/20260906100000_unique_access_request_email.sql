-- Auth already enforces one account per email. This mirrors that guarantee in
-- the app-side account record so manual inserts or trigger retries cannot
-- create two CampusCarpool accounts for the same address.

create unique index if not exists access_requests_email_lower_unique
  on public.access_requests (lower(email));
