-- Legacy rows (created before first_name/contact_* existed) need filling in
-- when their owner finishes signing up.
--
-- A plain UPDATE policy would also let a user rewrite their own `status`,
-- so a denied account could re-approve itself. This RPC touches only the
-- profile columns and is the reason there is still no UPDATE policy.
create or replace function public.update_my_profile(
  p_first_name text,
  p_last_name text,
  p_contact_method text,
  p_contact_value text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if p_contact_method is not null and p_contact_method not in ('phone', 'instagram') then
    raise exception 'Contact method must be phone or instagram';
  end if;

  update public.access_requests
  set first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
      last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
      contact_method = coalesce(p_contact_method, contact_method),
      contact_value = coalesce(nullif(trim(p_contact_value), ''), contact_value),
      full_name = trim(
        coalesce(nullif(trim(p_first_name), ''), first_name, '') || ' ' ||
        coalesce(nullif(trim(p_last_name), ''), last_name, '')
      )
  where user_id = auth.uid();
end;
$$;

revoke execute on function public.update_my_profile(text, text, text, text) from anon;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;
