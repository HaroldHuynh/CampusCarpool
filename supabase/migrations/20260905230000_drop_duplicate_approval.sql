-- Removes the duplicate approval system added in this session.
-- The project already had access_requests + app_admins + is_approved(uuid),
-- which is the source of truth. Everything below was a parallel copy of that,
-- and its no-arg is_approved() made every unqualified call ambiguous.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

do $$
begin
  if to_regclass('public.profiles') is not null then
    drop trigger if exists profiles_stamp_approved_at on public.profiles;
  end if;
end;
$$;
drop function if exists public.stamp_approved_at();

drop function if exists public.is_approved();

drop table if exists public.profiles;
drop type if exists public.account_status;
