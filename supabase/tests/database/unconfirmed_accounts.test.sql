begin;
select plan(15);

-- Fixtures: logins in every state that matters (times relative to now), as Supabase Auth writes them
-- with "Confirm email" on — the migration's precondition: an address stays unconfirmed until its code
-- is entered.
insert into auth.users (id, email, created_at, confirmation_sent_at, email_confirmed_at, last_sign_in_at, invited_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000ac001', 'never-entered@example.com', now() - interval '8 days', now() - interval '8 days', null, null, null, '{}'),
  ('00000000-0000-0000-0000-0000000ac002', 'asked-again@example.com', now() - interval '8 days', now() - interval '1 hour', null, null, null, '{}'),
  ('00000000-0000-0000-0000-0000000ac003', 'recent@example.com', now() - interval '6 days', now() - interval '6 days', null, null, null, '{}'),
  ('00000000-0000-0000-0000-0000000ac004', 'confirmed@example.com', now() - interval '30 days', now() - interval '30 days', now() - interval '30 days', null, null, '{}'),
  ('00000000-0000-0000-0000-0000000ac005', 'signed-in@example.com', now() - interval '30 days', null, null, now() - interval '20 days', null, '{}'),
  ('00000000-0000-0000-0000-0000000ac006', 'invited@example.com', now() - interval '30 days', null, null, null, now() - interval '30 days', '{}'),
  ('00000000-0000-0000-0000-0000000ac007', 'company@example.com', now() - interval '30 days', now() - interval '30 days', null, null, null, '{}');

-- Supabase Auth's audit log names the address of every code request (no link to the login).
insert into auth.audit_log_entries (instance_id, id, payload, created_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000ad001',
   '{"actor_id":"00000000-0000-0000-0000-0000000ac001","actor_username":"never-entered@example.com","action":"user_confirmation_requested","log_type":"user"}',
   now() - interval '8 days'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000ad002',
   '{"actor_id":"00000000-0000-0000-0000-0000000ac001","actor_username":"never-entered@example.com","action":"user_confirmation_requested","log_type":"user"}',
   now() - interval '9 days'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000ad004',
   '{"actor_id":"00000000-0000-0000-0000-0000000ac004","actor_username":"confirmed@example.com","action":"user_signedup","log_type":"team"}',
   now() - interval '30 days');

-- A company the platform registered for the last login (on delete restrict).
update public.profiles set role = 'mover' where id = '00000000-0000-0000-0000-0000000ac007';
insert into public.mover_companies (id, owner_id, legal_name, country)
values ('00000000-0000-0000-0000-0000000ac0c7', '00000000-0000-0000-0000-0000000ac007', 'Kept Movers', 'XK');

-- Other logins of the database may be cleaned up too (the cloud test run): count at least ours.
select cmp_ok(public.delete_unconfirmed_accounts(), '>=', 1, 'the cleanup deletes logins whose code was never entered');

select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000ac001'), 0,
  'a code never entered, last sent 8 days ago: the login is deleted');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000ac001'), 0,
  'and its profile with it (COMPLIANCE §9)');
select is((select count(*)::int from auth.audit_log_entries where payload ->> 'actor_id' = '00000000-0000-0000-0000-0000000ac001'), 0,
  'and the audit-log rows with the typed address');
select is((select count(*)::int from auth.audit_log_entries where id = '00000000-0000-0000-0000-0000000ad004'), 1,
  'the audit log of logins that stay is kept');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000ac002'), 1,
  'a new code an hour ago restarts the 7 days');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000ac003'), 1,
  'a code sent 6 days ago is kept');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000ac004'), 1,
  'a confirmed email is kept');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000ac005'), 1,
  'a login that has signed in is kept');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000ac006'), 1,
  'an invited login is kept');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000ac007'), 1,
  'a login with a company is kept (left for a person to look at)');

-- Only the platform runs it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ac004","role":"authenticated"}', true);
select throws_ok($$ select public.delete_unconfirmed_accounts() $$, '42501', null, 'signed-in users cannot run the cleanup');
set local role anon;
select throws_ok($$ select public.delete_unconfirmed_accounts() $$, '42501', null, 'visitors cannot run the cleanup');
reset role;

-- Every night.
select is((select schedule from cron.job where jobname = 'delete-unconfirmed-accounts'), '17 3 * * *',
  'the cleanup runs every night');
select is((select command from cron.job where jobname = 'delete-unconfirmed-accounts'),
  'select public.delete_unconfirmed_accounts()', 'the nightly job runs the cleanup');

select * from finish();
rollback;
