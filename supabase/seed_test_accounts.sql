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

select u.email, p.display_name, p.id as profile_id
from auth.users u
left join public.campus_profiles p on p.user_id = u.id
where u.email like '%.test@calpoly.edu'
order by u.email;
