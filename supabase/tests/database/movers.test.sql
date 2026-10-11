begin;
select plan(34);

-- Fixtures: two movers and a customer (profiles via the sign-up trigger). Service areas in Lisbon,
-- far from every test mover, so the sample data never mixes into these results.
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d201', '48500000201', '{"role":"mover","locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000d202', '48500000202', '{"role":"mover","locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000c201', '38344000201', '{"role":"customer","locale":"sq"}');

-- Tables + RLS --------------------------------------------------------------
select has_table('public', 'mover_companies', 'mover_companies table exists');
select is((select bool_and(rowsecurity) from pg_tables where schemaname = 'public'
           and tablename in ('mover_companies', 'mover_documents', 'vehicles', 'rate_cards', 'service_areas')),
  true, 'RLS is enabled on every mover table');

-- A mover registers their company ---------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d201","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.mover_companies (id, owner_id, legal_name, country)
     values ('00000000-0000-0000-0000-0000000aa001', '00000000-0000-0000-0000-00000000d201', 'Arta Mudanças Lda', 'PT') $$,
  'a mover can register their own company');

select throws_ok(
  $$ insert into public.mover_companies (owner_id, legal_name, country)
     values ('00000000-0000-0000-0000-00000000d202', 'Not mine', 'XK') $$,
  '42501', null, 'a mover cannot register a company for someone else');

select throws_ok(
  $$ insert into public.mover_companies (owner_id, legal_name, country, verification_status)
     values ('00000000-0000-0000-0000-00000000d201', 'Self-verified', 'XK', 'verified') $$,
  '42501', null, 'a mover cannot verify their own company');

select throws_ok(
  $$ update public.mover_companies set stripe_onboarding_complete = true
     where id = '00000000-0000-0000-0000-0000000aa001' $$,
  '42501', null, 'a mover cannot mark Stripe onboarding complete');

select lives_ok(
  $$ insert into public.vehicles (id, company_id, class, plate, max_weight_kg)
     values ('00000000-0000-0000-0000-0000000bb001', '00000000-0000-0000-0000-0000000aa001', 'VAN', 'TEST-AA-1', 2800) $$,
  'a mover can add a vehicle to their company');

select lives_ok(
  $$ insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper)
     values ('00000000-0000-0000-0000-0000000bb001', 'EUR', 2500, 60, 28) $$,
  'a mover can save a rate card for their vehicle');

select isnt((select confirmed_by_mover_at from public.rate_cards where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  null, 'saving the card confirms it (COMPLIANCE §1.1)');

select lives_ok(
  $$ insert into public.service_areas (company_id, center, radius_km)
     values ('00000000-0000-0000-0000-0000000aa001', 'SRID=4326;POINT(-9.1393 38.7223)', 40) $$,
  'a mover can set a service area');

select lives_ok(
  $$ insert into public.mover_documents (id, company_id, type, file_path, expires_at)
     values ('00000000-0000-0000-0000-0000000dd001', '00000000-0000-0000-0000-0000000aa001', 'insurance', 'aa001/insurance.pdf', now() + interval '1 year') $$,
  'a mover can upload an insurance document');

select throws_ok(
  $$ update public.mover_documents set verified_at = now() where id = '00000000-0000-0000-0000-0000000dd001' $$,
  '42501', null, 'a mover cannot verify their own document');

-- Another mover and a customer see none of it ---------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d202","role":"authenticated"}', true);
select is((select count(*)::int from public.mover_companies), 0, 'another mover cannot see the company');
select is((select count(*)::int from public.rate_cards), 0, 'another mover cannot see the rate card');

select throws_ok(
  $$ insert into public.vehicles (company_id, class, plate)
     values ('00000000-0000-0000-0000-0000000aa001', 'BOX', 'TEST-HACK') $$,
  '42501', null, 'another mover cannot add vehicles to the company');

update public.rate_cards set base_fee = 1 where vehicle_id = '00000000-0000-0000-0000-0000000bb001';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c201","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.mover_companies (owner_id, legal_name, country)
     values ('00000000-0000-0000-0000-00000000c201', 'Customer Co', 'XK') $$,
  '42501', null, 'a customer cannot register a mover company');
select is((select count(*)::int from public.vehicles), 0, 'a customer cannot see vehicles');

set local role anon;
select throws_ok($$ select * from public.rate_cards $$, '42501', null, 'visitors cannot read rate cards');

reset role;
select set_config('request.jwt.claims', '', true); -- acting as the platform (service role) from here
select is((select base_fee from public.rate_cards where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  2500, 'another mover cannot change the rate card');

-- Admin (service role) verifies; quotable_vehicles -----------------------------------
update public.mover_companies set verification_status = 'verified', stripe_onboarding_complete = true
where id = '00000000-0000-0000-0000-0000000aa001';
update public.mover_documents set verified_at = now() where id = '00000000-0000-0000-0000-0000000dd001';

select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  1, 'a verified, insured, confirmed vehicle with the pickup in its area is quotable');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-8.61 41.15)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  0, 'a pickup outside the service area is not quoted');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'BOX')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  0, 'only the requested vehicle class is quoted');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  0, 'no cross-border jobs without CMR insurance, licence and tachograph (COMPLIANCE §5, §11)');

insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000aa001', 'cmr', 'aa001/cmr.pdf', now() + interval '1 year', now()),
       ('00000000-0000-0000-0000-0000000aa001', 'licence', 'aa001/licence.pdf', null, now());
update public.vehicles set tachograph = true where id = '00000000-0000-0000-0000-0000000bb001';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  1, 'with CMR, licence and tachograph the vehicle can take cross-border jobs');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'ES', 'ES', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  0, 'no domestic jobs in a country where the mover is not registered (cabotage)');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'ES', 'FR', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  0, 'cross-border only from or to the mover''s own country (no cross-trade)');

-- The mover edits identity / documents → back to verification.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d201","role":"authenticated"}', true);
update public.mover_companies set legal_name = 'Arta Moving & Co' where id = '00000000-0000-0000-0000-0000000aa001';
update public.mover_documents set expires_at = now() + interval '2 years' where id = '00000000-0000-0000-0000-0000000dd001';
reset role;
select set_config('request.jwt.claims', '', true);
select is((select verification_status::text from public.mover_companies where id = '00000000-0000-0000-0000-0000000aa001'),
  'pending', 'changing the legal name sends the company back to verification');
select is((select verified_at from public.mover_documents where id = '00000000-0000-0000-0000-0000000dd001'),
  null, 'a changed document must be verified again');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  0, 'unverified companies are not quoted');

-- Expired insurance, unconfirmed cards and test movers --------------------------------
update public.mover_companies set verification_status = 'verified' where id = '00000000-0000-0000-0000-0000000aa001';
update public.mover_documents set verified_at = now(), expires_at = now() - interval '1 day'
where id = '00000000-0000-0000-0000-0000000dd001';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  0, 'expired insurance blocks quotes (COMPLIANCE §5)');
update public.mover_documents set expires_at = now() + interval '1 year' where id = '00000000-0000-0000-0000-0000000dd001';

-- A suggested card pre-filled by the service role is not used until the mover saves it.
update public.rate_cards set confirmed_by_mover_at = null where vehicle_id = '00000000-0000-0000-0000-0000000bb001';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  0, 'rates the mover has not confirmed are never quoted (COMPLIANCE §1.1)');
update public.rate_cards set confirmed_by_mover_at = now() where vehicle_id = '00000000-0000-0000-0000-0000000bb001';

update public.mover_companies set is_test = true where id = '00000000-0000-0000-0000-0000000aa001';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  0, 'test movers are left out by default');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN', true)
   where vehicle_id = '00000000-0000-0000-0000-0000000bb001'),
  1, 'test movers are quoted when enabled');

set local role authenticated;
select throws_ok(
  $$ select * from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN') $$,
  '42501', null, 'only the server can list quotable vehicles');

select * from finish();
rollback;
