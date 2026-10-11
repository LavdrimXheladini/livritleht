begin;
select plan(13);

-- Fixtures: three users created the way GoTrue does it.
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000c001', '38344000101', '{"role":"customer","locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d001', '48500000101', '{"role":"mover","locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000e001', '38344000102', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-00000000c002', '4915100000101', '{"role":"customer","locale":"de"}');

select has_table('public', 'profiles', 'profiles table exists');
select is(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'profiles'),
  true, 'RLS is enabled on profiles');

-- Sign-up trigger
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000c001'),
  'customer', 'customer sign-up gets customer role');
select is((select locale::text from public.profiles where id = '00000000-0000-0000-0000-00000000c001'),
  'sq', 'locale is taken from sign-up metadata');
select is((select locale::text from public.profiles where id = '00000000-0000-0000-0000-00000000c002'),
  'de', 'German locale is accepted at sign-up');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000d001'),
  'mover', 'mover sign-up gets mover role');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000e001'),
  'customer', 'admin cannot be self-assigned at sign-up');

-- Act as the customer
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'user sees only their own profile');

select lives_ok(
  $$ update public.profiles set name = 'Arta', locale = 'en' where id = '00000000-0000-0000-0000-00000000c001' $$,
  'user can update own name and locale');

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000c001' $$,
  '42501', null, 'user cannot change own role');

update public.profiles set name = 'Hacked' where id = '00000000-0000-0000-0000-00000000d001';
reset role;
select is((select name from public.profiles where id = '00000000-0000-0000-0000-00000000d001'),
  null, 'user cannot update another user''s profile');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000f001') $$,
  '42501', null, 'clients cannot insert profiles');

set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');

select * from finish();
rollback;
