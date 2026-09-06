-- Carry signup details through to the approval record, so an admin reviewing
-- access_requests can see who someone is and how to reach them.
-- Approved by the schema's author before applying.

alter table public.access_requests
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists contact_method text,
  add column if not exists contact_value text;

-- Existing rows predate these columns and stay null, so the constraint has to
-- tolerate null rather than demand a backfill.
alter table public.access_requests
  drop constraint if exists access_requests_contact_method_check;

alter table public.access_requests
  add constraint access_requests_contact_method_check
  check (contact_method is null or contact_method in ('phone', 'instagram'));

-- Same function the project already used; only the copied columns are new.
create or replace function public.create_access_request_for_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.access_requests (
    user_id, email, full_name, first_name, last_name, contact_method, contact_value
  )
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'contact_method',
    new.raw_user_meta_data ->> 'contact_value'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
