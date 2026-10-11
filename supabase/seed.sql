-- Local dev seed. Sign in with the test numbers from config.toml [auth.sms.test_otp]
-- (code 123456) or any email via Mailpit at http://127.0.0.1:54324.
--   +383 44 000 001 → customer      +48 500 000 001 → mover
-- Movers, vehicles and rate cards are added when those tables exist (build step 2).

insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   '38344000001', now(), '{"provider":"phone","providers":["phone"]}', '{"role":"customer","locale":"sq"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   '48500000001', now(), '{"provider":"phone","providers":["phone"]}', '{"role":"mover","locale":"pl"}', now(), now());

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'phone',
   '{"sub":"10000000-0000-0000-0000-000000000001","phone":"38344000001"}', now(), now(), now()),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'phone',
   '{"sub":"20000000-0000-0000-0000-000000000001","phone":"48500000001"}', now(), now(), now());

update public.profiles set name = 'Test Customer' where id = '10000000-0000-0000-0000-000000000001';
update public.profiles set name = 'Test Mover'    where id = '20000000-0000-0000-0000-000000000001';
