-- Local dev seed: two phone accounts with their roles set. The app: create an account with any address
-- (code via Mailpit at http://127.0.0.1:54324), then email + password. The website's phone sign-in takes
-- the test numbers from config.toml [auth.sms.test_otp], code 123456.
--   +383 44 000 001 → customer      +48 500 000 001 → mover
-- Roles are normally chosen after the first sign-in (public.choose_role, which also switches sides); set directly here.
-- Sample movers, vehicles and rate cards come from migration 20261012091000_test_movers.sql (is_test).

insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   '38344000001', now(), '{"provider":"phone","providers":["phone"]}', '{"locale":"sq"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   '48500000001', now(), '{"provider":"phone","providers":["phone"]}', '{"locale":"pl"}', now(), now());

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'phone',
   '{"sub":"10000000-0000-0000-0000-000000000001","phone":"38344000001"}', now(), now(), now()),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'phone',
   '{"sub":"20000000-0000-0000-0000-000000000001","phone":"48500000001"}', now(), now(), now());

update public.profiles set role = 'customer', name = 'Test Customer' where id = '10000000-0000-0000-0000-000000000001';
update public.profiles set role = 'mover',    name = 'Test Mover'    where id = '20000000-0000-0000-0000-000000000001';
