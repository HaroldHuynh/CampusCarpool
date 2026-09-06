-- Private one-to-one messages between CampusCarpool profiles.
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.campus_profiles(id) on delete cascade,
  recipient_profile_id uuid not null references public.campus_profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_different_people check (sender_profile_id <> recipient_profile_id),
  constraint direct_messages_body_length check (char_length(trim(body)) between 1 and 1000)
);

create index if not exists direct_messages_sender_created_idx
  on public.direct_messages(sender_profile_id, created_at desc);
create index if not exists direct_messages_recipient_created_idx
  on public.direct_messages(recipient_profile_id, created_at desc);
create index if not exists direct_messages_unread_idx
  on public.direct_messages(recipient_profile_id, created_at desc)
  where read_at is null;

alter table public.direct_messages enable row level security;

drop policy if exists "Message participants can read" on public.direct_messages;
create policy "Message participants can read"
on public.direct_messages
for select
to authenticated
using (
  sender_profile_id = public.my_profile_id()
  or recipient_profile_id = public.my_profile_id()
);

revoke all on public.direct_messages from anon;
revoke insert, update, delete on public.direct_messages from authenticated;
grant select on public.direct_messages to authenticated;

create or replace function public.send_direct_message(target_profile_id uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  clean_body text;
  new_id uuid;
begin
  select p.id into me from public.campus_profiles p where p.user_id = auth.uid();
  if me is null then raise exception 'Not signed in'; end if;
  if target_profile_id = me then raise exception 'You cannot message yourself'; end if;
  if not exists (select 1 from public.campus_profiles p where p.id = target_profile_id) then
    raise exception 'That profile is unavailable';
  end if;

  clean_body := trim(message_body);
  if char_length(clean_body) < 1 or char_length(clean_body) > 1000 then
    raise exception 'Messages must be between 1 and 1000 characters';
  end if;

  insert into public.direct_messages(sender_profile_id, recipient_profile_id, body)
  values (me, target_profile_id, clean_body)
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.get_message_threads()
returns table (
  profile_id uuid,
  display_name text,
  rating_average numeric,
  rating_count integer,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with me as (
    select p.id from public.campus_profiles p where p.user_id = auth.uid()
  ), participant_messages as (
    select
      dm.*,
      case
        when dm.sender_profile_id = me.id then dm.recipient_profile_id
        else dm.sender_profile_id
      end as other_profile_id,
      me.id as my_profile_id
    from public.direct_messages dm
    cross join me
    where dm.sender_profile_id = me.id or dm.recipient_profile_id = me.id
  ), latest as (
    select distinct on (pm.other_profile_id)
      pm.other_profile_id,
      pm.body,
      pm.created_at
    from participant_messages pm
    order by pm.other_profile_id, pm.created_at desc, pm.id desc
  ), unread as (
    select pm.other_profile_id, count(*) as unread_count
    from participant_messages pm
    where pm.recipient_profile_id = pm.my_profile_id and pm.read_at is null
    group by pm.other_profile_id
  )
  select
    p.id,
    p.display_name,
    p.rating_average,
    p.rating_count,
    latest.body,
    latest.created_at,
    coalesce(unread.unread_count, 0)
  from latest
  join public.campus_profiles p on p.id = latest.other_profile_id
  left join unread on unread.other_profile_id = latest.other_profile_id
  order by latest.created_at desc
$$;

create or replace function public.get_direct_conversation(target_profile_id uuid)
returns table (
  id uuid,
  sender_profile_id uuid,
  recipient_profile_id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  with me as (
    select p.id from public.campus_profiles p where p.user_id = auth.uid()
  )
  select dm.id, dm.sender_profile_id, dm.recipient_profile_id, dm.body, dm.created_at, dm.read_at
  from public.direct_messages dm
  cross join me
  where (dm.sender_profile_id = me.id and dm.recipient_profile_id = target_profile_id)
     or (dm.sender_profile_id = target_profile_id and dm.recipient_profile_id = me.id)
  order by dm.created_at, dm.id
$$;

create or replace function public.mark_direct_messages_read(target_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid;
  changed integer;
begin
  select p.id into me from public.campus_profiles p where p.user_id = auth.uid();
  if me is null then raise exception 'Not signed in'; end if;

  update public.direct_messages
  set read_at = now()
  where sender_profile_id = target_profile_id
    and recipient_profile_id = me
    and read_at is null;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.get_unread_message_count()
returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)
  from public.direct_messages dm
  where dm.recipient_profile_id = (
    select p.id from public.campus_profiles p where p.user_id = auth.uid()
  )
    and dm.read_at is null
$$;

revoke execute on function public.send_direct_message(uuid, text) from anon, public;
revoke execute on function public.get_message_threads() from anon, public;
revoke execute on function public.get_direct_conversation(uuid) from anon, public;
revoke execute on function public.mark_direct_messages_read(uuid) from anon, public;
revoke execute on function public.get_unread_message_count() from anon, public;

grant execute on function public.send_direct_message(uuid, text) to authenticated;
grant execute on function public.get_message_threads() to authenticated;
grant execute on function public.get_direct_conversation(uuid) to authenticated;
grant execute on function public.mark_direct_messages_read(uuid) to authenticated;
grant execute on function public.get_unread_message_count() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end;
$$;
