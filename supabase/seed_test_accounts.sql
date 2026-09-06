-- Test accounts for exercising the ride flows end to end.
-- NOT part of the migration chain — run deliberately, and only against a
-- development project. Emails are under @calpoly.edu so the domain rules and
-- the signup trigger behave exactly as they do for a real account.
--
-- Password for every seeded account: TestPass123!

do $$
declare
  spec record;
  new_id uuid;
begin
  for spec in
    select * from (values
      ('driver.test@calpoly.edu', 'Dana Driver'),
      ('rider.test@calpoly.edu', 'Riley Rider'),
      ('rider2.test@calpoly.edu', 'Robin Second')
    ) as t(email, full_name)
  loop
    if exists (select 1 from auth.users u where u.email = spec.email) then
      continue;
    end if;

    new_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
      spec.email, extensions.crypt('TestPass123!', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      json_build_object('full_name', spec.full_name)::jsonb,
      '', '', '', ''
    );

    -- Password sign-in needs a matching identity row.
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    values (
      new_id::text, new_id,
      json_build_object('sub', new_id::text, 'email', spec.email)::jsonb,
      'email', now(), now(), now()
    );
  end loop;
end;
$$;

-- The production confirmation trigger normally creates these records.  Keep
-- the fixture self-contained so it also works with a schema-only local dump.
insert into public.access_requests (
  user_id, email, full_name, status, first_name, last_name, contact_method, contact_value
)
select
  u.id,
  u.email,
  case u.email
    when 'driver.test@calpoly.edu' then 'Dana Driver'
    when 'rider.test@calpoly.edu' then 'Riley Rider'
    else 'Robin Second'
  end,
  'approved',
  case u.email
    when 'driver.test@calpoly.edu' then 'Dana'
    when 'rider.test@calpoly.edu' then 'Riley'
    else 'Robin'
  end,
  case u.email
    when 'driver.test@calpoly.edu' then 'Driver'
    when 'rider.test@calpoly.edu' then 'Rider'
    else 'Second'
  end,
  'phone',
  case u.email
    when 'driver.test@calpoly.edu' then '+18055550101'
    when 'rider.test@calpoly.edu' then '+18055550102'
    else '+18055550103'
  end
from auth.users u
where u.email in ('driver.test@calpoly.edu', 'rider.test@calpoly.edu', 'rider2.test@calpoly.edu')
on conflict (user_id) do update
set
  full_name = excluded.full_name,
  status = excluded.status,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  contact_method = excluded.contact_method,
  contact_value = excluded.contact_value;

insert into public.campus_profiles (display_name, user_id)
select ar.full_name, ar.user_id
from public.access_requests ar
where ar.email in ('driver.test@calpoly.edu', 'rider.test@calpoly.edu', 'rider2.test@calpoly.edu')
on conflict (user_id) do update
set display_name = excluded.display_name;

select u.email, p.display_name, p.id as profile_id
from auth.users u
left join public.campus_profiles p on p.user_id = u.id
where u.email like '%.test@calpoly.edu'
order by u.email;
