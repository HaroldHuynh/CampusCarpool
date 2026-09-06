-- Verifying the emailed code is now the membership gate, so access_requests
-- flips from an allowlist to a denylist: approved by default, set 'denied' to
-- lock someone out. is_approved() and every policy on it keep working.
alter table public.access_requests alter column status set default 'approved';

update public.access_requests set status = 'approved' where status = 'pending';

-- Approval used to keep non-Cal Poly addresses out. With it automatic, the
-- domain rule would live only in the React form, which anyone can skip by
-- calling the API directly with the public anon key. Enforce it in the DB.
create or replace function public.create_access_request_for_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if lower(new.email) not like '%@calpoly.edu' then
    raise exception 'Only @calpoly.edu addresses can register';
  end if;

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
