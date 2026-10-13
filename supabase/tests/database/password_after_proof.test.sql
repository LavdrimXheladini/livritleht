begin;
select plan(5);

-- Fixtures: an unconfirmed login with a password someone chose before proving the address (as
-- /auth/v1/signup leaves it), and logins whose address is already proven.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000af001', 'planted@example.com', 'planted-hash', null, null, null, '{"password_set":true}'),
  ('00000000-0000-0000-0000-0000000af002', 'owner@example.com', 'owner-hash', now(), null, null, '{}'),
  ('00000000-0000-0000-0000-0000000af003', 'phone@example.com', 'phone-owner-hash', null, '38344000777', now(), '{}'),
  ('00000000-0000-0000-0000-0000000af004', 'waiting@example.com', 'waiting-hash', null, null, null, '{}');

-- The owner confirms the address with the code (what Supabase Auth's verify does).
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000af001';
select is((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000af001'), '',
  'a password set before the address was proven no longer signs in once the owner confirms it');

-- The owner then chooses their own.
update auth.users set encrypted_password = 'chosen-hash' where id = '00000000-0000-0000-0000-0000000af001';
select is((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000af001'), 'chosen-hash',
  'the password the owner sets after confirming stays');

update auth.users set encrypted_password = 'new-owner-hash' where id = '00000000-0000-0000-0000-0000000af002';
select is((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000af002'), 'new-owner-hash',
  'a confirmed account changes its password as usual');

update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000af003';
select is((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000af003'), 'phone-owner-hash',
  'an account already proven by phone keeps its password when it confirms an email too');

update auth.users set confirmation_sent_at = now() where id = '00000000-0000-0000-0000-0000000af004';
select is((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000af004'), 'waiting-hash',
  'nothing changes before the address is proven (e.g. a new code is sent)');

select * from finish();
rollback;
