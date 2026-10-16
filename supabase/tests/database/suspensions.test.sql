begin;
select plan(24);

-- Terms published on the project would leave these sample movers unquoted until they accept them
-- (20261016100000, tested in terms.test.sql): set aside here, like everything else (rolled back).
delete from public.terms_acceptances;
delete from public.terms_notices;
delete from public.terms_versions;

-- Suspensions (COMPLIANCE §3): a written reason, human review before any effect, notice, 30 days
-- for a termination, and suspended or terminated companies are not quoted.
-- Fixtures: a mover with a quotable van in Lisbon (far from every test mover), a second mover, a
-- customer and an admin (the admin role is granted by the platform, never at sign-up).
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d401', '48500000401', '{"locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000d402', '48500000402', '{"locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000c401', '38344000401', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000e401', '38344000402', '{"locale":"en"}');
-- Roles are chosen after the first sign-in (public.choose_role); the admin role only by the platform.
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d401', '00000000-0000-0000-0000-00000000d402');
update public.profiles set role = 'customer' where id = '00000000-0000-0000-0000-00000000c401';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000e401';

insert into public.mover_companies (id, owner_id, legal_name, country, verification_status, stripe_onboarding_complete, cancel_free_hours, cancel_late_pct)
values ('00000000-0000-0000-0000-0000000aa401', '00000000-0000-0000-0000-00000000d401', 'Rio Mudanças Lda', 'PT', 'verified', true, 48, 50),
       ('00000000-0000-0000-0000-0000000aa402', '00000000-0000-0000-0000-00000000d402', 'Tejo Transportes Lda', 'PT', 'verified', true, 48, 50);
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, verified_at)
values ('00000000-0000-0000-0000-0000000bb401', '00000000-0000-0000-0000-0000000aa401', 'VAN', 'TEST-SU-1', 2800, now());
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
values ('00000000-0000-0000-0000-0000000bb401', 'EUR', 2500, 60, 28, now());
insert into public.service_areas (company_id, center, radius_km)
values ('00000000-0000-0000-0000-0000000aa401', 'SRID=4326;POINT(-9.1393 38.7223)', 40);
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000aa401', 'insurance', 'aa401/insurance.pdf', now() + interval '1 year', now());

select has_table('public', 'suspensions', 'suspensions table exists');
select is((select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'suspensions'),
  true, 'RLS is enabled on suspensions');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb401'),
  1, 'the mover is quoted before any decision');

-- Every decision has a written reason and a human reviewer (COMPLIANCE §3) ----------------------
select throws_ok(
  $$ insert into public.suspensions (company_id, kind, flagged_by, reason_text)
     values ('00000000-0000-0000-0000-0000000aa402', 'suspension', 'admin', '   ') $$,
  '23514', null, 'a decision needs a written reason');
select throws_ok(
  $$ insert into public.suspensions (company_id, kind, flagged_by)
     values ('00000000-0000-0000-0000-0000000aa402', 'suspension', 'admin') $$,
  '23502', null, 'a decision without any reason is rejected');
select throws_ok(
  $$ insert into public.suspensions (company_id, kind, flagged_by, reason_text, notice_sent_at, effective_at)
     values ('00000000-0000-0000-0000-0000000aa402', 'suspension', 'algorithm', 'Rating below 2.0', now(), now()) $$,
  '23514', null, 'nothing takes effect without a human review: an algorithm may only flag');
select throws_ok(
  $$ insert into public.suspensions (company_id, kind, flagged_by, reason_text, reviewed_by, notice_sent_at, effective_at)
     values ('00000000-0000-0000-0000-0000000aa402', 'suspension', 'customer_report', 'Reported damage',
             '00000000-0000-0000-0000-00000000d401', now(), now()) $$,
  '23514', null, 'only an admin can be the reviewer');
select throws_ok(
  $$ insert into public.suspensions (company_id, kind, flagged_by, reason_text, reviewed_by, effective_at)
     values ('00000000-0000-0000-0000-0000000aa402', 'suspension', 'admin', 'Insurance missing',
             '00000000-0000-0000-0000-00000000e401', now()) $$,
  '23514', null, 'a decision takes effect only once the mover has been given the reasons');
select throws_ok(
  $$ insert into public.suspensions (company_id, kind, flagged_by, reason_text, reviewed_by, notice_sent_at, effective_at)
     values ('00000000-0000-0000-0000-0000000aa402', 'termination', 'admin', 'Repeated late cancellations',
             '00000000-0000-0000-0000-00000000e401', now(), now() + interval '10 days') $$,
  '23514', null, 'a termination takes effect at least 30 days after the notice');
select lives_ok(
  $$ insert into public.suspensions (id, company_id, kind, flagged_by, reason_text, is_serious_violation, reviewed_by, notice_sent_at, effective_at)
     values ('00000000-0000-0000-0000-0000000ee402', '00000000-0000-0000-0000-0000000aa402', 'termination', 'admin',
             'Fraud: forged insurance certificate', true, '00000000-0000-0000-0000-00000000e401', now(), now()) $$,
  'a serious violation may end the account at once, still with reasons');

-- An algorithm flag alone changes nothing --------------------------------------------------
insert into public.suspensions (id, company_id, kind, flagged_by, reason_text)
values ('00000000-0000-0000-0000-0000000ee401', '00000000-0000-0000-0000-0000000aa401', 'suspension', 'algorithm',
        'Three damage claims in 30 days');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb401'),
  1, 'an algorithm flag does not stop quotes (COMPLIANCE §3)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d401","role":"authenticated"}', true);
select is((select count(*)::int from public.suspensions), 0, 'a flag nobody has decided on is not shown to the mover yet');
select throws_ok(
  $$ insert into public.suspensions (company_id, kind, flagged_by, reason_text)
     values ('00000000-0000-0000-0000-0000000aa402', 'suspension', 'customer_report', 'Competitor') $$,
  '42501', null, 'a mover cannot suspend anyone');

-- An admin reviews it: suspended from now -----------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true); -- acting as the platform (service role)
update public.suspensions
set reviewed_by = '00000000-0000-0000-0000-00000000e401', notice_sent_at = now(), effective_at = now()
where id = '00000000-0000-0000-0000-0000000ee401';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb401'),
  0, 'a suspended company''s vehicles are not quotable');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN', false, now() + interval '30 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb401'),
  0, 'nor for a later move date while the suspension lasts');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d401","role":"authenticated"}', true);
select is((select reason_text from public.suspensions where id = '00000000-0000-0000-0000-0000000ee401'),
  'Three damage claims in 30 days', 'the mover reads the reasons for their suspension');
select throws_ok(
  $$ update public.suspensions set lifted_at = now() where id = '00000000-0000-0000-0000-0000000ee401' $$,
  '42501', null, 'a mover cannot lift their own suspension');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d402","role":"authenticated"}', true);
select is((select count(*)::int from public.suspensions where company_id = '00000000-0000-0000-0000-0000000aa401'),
  0, 'another mover cannot see it');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c401","role":"authenticated"}', true);
select is((select count(*)::int from public.suspensions), 0, 'a customer sees no suspensions');
set local role anon;
select throws_ok($$ select * from public.suspensions $$, '42501', null, 'visitors cannot read suspensions');

reset role;
select set_config('request.jwt.claims', '', true);
update public.suspensions set lifted_at = now() where id = '00000000-0000-0000-0000-0000000ee401';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb401'),
  1, 'once lifted, the mover is quoted again');

-- A termination with 30 days' notice: moves before it are fine, moves after it are not ------
insert into public.suspensions (company_id, kind, flagged_by, reason_text, reviewed_by, notice_sent_at, effective_at)
values ('00000000-0000-0000-0000-0000000aa401', 'termination', 'admin', 'Terms breached repeatedly',
        '00000000-0000-0000-0000-00000000e401', now(), now() + interval '31 days');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN', false, now() + interval '10 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb401'),
  1, 'during the notice period the mover is still quoted for moves before the termination');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN', false, now() + interval '40 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb401'),
  0, 'a move after the termination date is not quoted');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb401'),
  1, 'without a move date the mover is quoted until the termination takes effect');

select * from finish();
rollback;
