begin;
select plan(7);

select has_table('public', 'waitlist', 'waitlist table exists');
select is(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'waitlist'),
  true, 'RLS is enabled on waitlist');

set local role anon;

select lives_ok(
  $$ insert into public.waitlist (email, locale) values ('ana@example.com', 'sq') $$,
  'anonymous visitors can join');

select throws_ok(
  $$ insert into public.waitlist (email) values ('ANA@example.com') $$,
  '23505', null, 'the same address (any case) cannot join twice');

select throws_ok(
  $$ insert into public.waitlist (email) values ('not-an-email') $$,
  '23514', null, 'invalid addresses are rejected');

select throws_ok(
  $$ select * from public.waitlist $$,
  '42501', null, 'anonymous visitors cannot read the list');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select throws_ok(
  $$ select email from public.waitlist $$,
  '42501', null, 'signed-in users cannot read the list either');

select * from finish();
rollback;
