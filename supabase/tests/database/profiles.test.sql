begin;
select plan(24);

-- Fixtures: four users created the way GoTrue does it. Older clients sent a role in the sign-up
-- metadata; it is ignored now — the role is chosen after the first sign-in (public.choose_role).
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000c001', '38344000101', '{"role":"customer","locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d001', '48500000101', '{"role":"mover","locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000e001', '38344000102', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-00000000c002', '4915100000101', '{"locale":"de"}');

select has_table('public', 'profiles', 'profiles table exists');
select is(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'profiles'),
  true, 'RLS is enabled on profiles');

-- Sign-up trigger
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000c002'),
  null, 'a new account has no role until its owner chooses one');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000d001'),
  null, 'sign-up metadata cannot set the role (anyone could send it for any email)');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000e001'),
  null, 'admin cannot be self-assigned at sign-up');
select is((select locale::text from public.profiles where id = '00000000-0000-0000-0000-00000000c001'),
  'sq', 'locale is taken from sign-up metadata');
select is((select locale::text from public.profiles where id = '00000000-0000-0000-0000-00000000c002'),
  'de', 'German locale is accepted at sign-up');

-- Choosing the role after signing in, and switching sides later
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select is(public.choose_role('customer')::text, 'customer', 'a signed-in user chooses their role');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000c001'),
  'customer', 'the choice is stored on their profile');
select is(public.choose_role('mover')::text, 'mover', 'a customer can switch to the mover side');
select is(public.choose_role('customer')::text, 'customer', 'and back to the customer side');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}', true);
select throws_ok($$ select public.choose_role('admin') $$, '22023', null, 'nobody can choose admin');
select is(public.choose_role('mover')::text, 'mover', 'a new mover chooses mover');

-- Act as the customer
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'user sees only their own profile');

select lives_ok(
  $$ update public.profiles set name = 'Arta', locale = 'en' where id = '00000000-0000-0000-0000-00000000c001' $$,
  'user can update own name and locale');

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000c001' $$,
  '42501', null, 'users cannot write their role directly (only through choose_role)');

update public.profiles set name = 'Hacked' where id = '00000000-0000-0000-0000-00000000d001';
reset role;
select is((select name from public.profiles where id = '00000000-0000-0000-0000-00000000d001'),
  null, 'user cannot update another user''s profile');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000f001') $$,
  '42501', null, 'clients cannot insert profiles');

select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.choose_role('customer') $$, '42501', null, 'choosing a role needs a signed-in user');

set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select public.choose_role('customer') $$, '42501', null, 'visitors cannot choose a role');

-- An admin's role is set by the platform only: they can't switch it away.
reset role;
select set_config('request.jwt.claims', '', true);
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000e001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select throws_ok($$ select public.choose_role('customer') $$, '55000', null, 'an admin cannot switch their own role');

-- Account deletion (COMPLIANCE §9): the platform deletes the login, the profile goes with it.
reset role;
select set_config('request.jwt.claims', '', true);
delete from auth.users where id = '00000000-0000-0000-0000-00000000c001';
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000c001'),
  0, 'deleting a customer''s account erases their profile (COMPLIANCE §9)');
delete from auth.users where id = '00000000-0000-0000-0000-00000000d001';
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000d001'),
  0, 'deleting a mover''s account without a company erases their profile (COMPLIANCE §9)');

select * from finish();
rollback;
