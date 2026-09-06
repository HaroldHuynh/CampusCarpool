-- Ratings and profile edits need to reach open boards and profile cards
-- without a refresh, the same way seats and messages already do.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_ratings'
  ) then
    alter publication supabase_realtime add table public.user_ratings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campus_profiles'
  ) then
    alter publication supabase_realtime add table public.campus_profiles;
  end if;
end;
$$;
