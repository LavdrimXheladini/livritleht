begin;
select plan(35);

-- Vehicle verification (COMPLIANCE §5, §11) and documents valid on the move date.
-- Fixtures: one mover whose company is verified, insured and has CMR insurance (no operator licence
-- yet). Service area in Lisbon, far from every test mover, so the sample data never mixes in.
insert into auth.users (id, phone, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000d301', '48500000301', '{"role":"mover","locale":"pl"}');

select has_column('public', 'vehicles', 'verified_at', 'vehicles record when an admin verified them');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d301","role":"authenticated"}', true);
insert into public.mover_companies (id, owner_id, legal_name, country)
values ('00000000-0000-0000-0000-0000000aa301', '00000000-0000-0000-0000-00000000d301', 'Ponte Mudanças Lda', 'PT');
insert into public.service_areas (company_id, center, radius_km)
values ('00000000-0000-0000-0000-0000000aa301', 'SRID=4326;POINT(-9.1393 38.7223)', 40);

-- The mover adds vehicles: they start unverified, and the mover can't verify them ----------
select lives_ok(
  $$ insert into public.vehicles (id, company_id, class, plate, max_weight_kg)
     values ('00000000-0000-0000-0000-0000000bb301', '00000000-0000-0000-0000-0000000aa301', 'VAN', 'TEST-VV-1', 2800),
            ('00000000-0000-0000-0000-0000000bb302', '00000000-0000-0000-0000-0000000aa301', 'TRUCK', 'TEST-VV-2', 7500),
            ('00000000-0000-0000-0000-0000000bb303', '00000000-0000-0000-0000-0000000aa301', 'LARGE_VAN', 'TEST-VV-3', 3500) $$,
  'a mover can add vehicles');
select is((select count(*)::int from public.vehicles where company_id = '00000000-0000-0000-0000-0000000aa301' and verified_at is null),
  3, 'new vehicles start unverified');
select throws_ok(
  $$ insert into public.vehicles (company_id, class, plate, verified_at)
     values ('00000000-0000-0000-0000-0000000aa301', 'VAN', 'TEST-VV-X', now()) $$,
  '42501', null, 'a mover cannot add a vehicle as verified');
select throws_ok(
  $$ update public.vehicles set verified_at = now() where id = '00000000-0000-0000-0000-0000000bb301' $$,
  '42501', null, 'a mover cannot verify their own vehicle');

-- The class must fit the weight (COMPLIANCE §1.1) ----------------------------------------
select throws_ok(
  $$ insert into public.vehicles (company_id, class, plate, max_weight_kg)
     values ('00000000-0000-0000-0000-0000000aa301', 'TRUCK', 'TEST-VV-4', 2000) $$,
  '23514', null, 'a truck of 2000 kg is rejected: trucks are over 3.5 t');
select throws_ok(
  $$ insert into public.vehicles (company_id, class, plate, max_weight_kg)
     values ('00000000-0000-0000-0000-0000000aa301', 'BOX', 'TEST-VV-5', 4200) $$,
  '23514', null, 'a box van over 3.5 t is rejected');
select lives_ok(
  $$ insert into public.vehicles (company_id, class, plate)
     values ('00000000-0000-0000-0000-0000000aa301', 'TRUCK', 'TEST-VV-6') $$,
  'a truck of unknown weight may be added (it counts as heavy)');

-- The platform verifies the company and its documents, not yet the vehicles ---------------
reset role;
select set_config('request.jwt.claims', '', true); -- acting as the platform (service role) from here
update public.mover_companies set verification_status = 'verified', stripe_onboarding_complete = true
where id = '00000000-0000-0000-0000-0000000aa301';
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000aa301', 'insurance', 'aa301/insurance.pdf', now() + interval '1 year', now()),
       ('00000000-0000-0000-0000-0000000aa301', 'cmr', 'aa301/cmr.pdf', now() + interval '1 year', now());
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
values ('00000000-0000-0000-0000-0000000bb301', 'EUR', 2500, 60, 28, now()),
       ('00000000-0000-0000-0000-0000000bb302', 'EUR', 7500, 130, 45, now()),
       ('00000000-0000-0000-0000-0000000bb303', 'EUR', 3500, 80, 33, now());

select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  0, 'an unverified vehicle is not quoted, even with its company and documents verified');
-- Up to 2.5 t, CMR insurance is all a cross-border job needs: the unverified weight must not count.
update public.vehicles set max_weight_kg = 2400 where id = '00000000-0000-0000-0000-0000000bb301';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  0, 'an unverified vehicle is never quoted cross-border (COMPLIANCE §5, §11)');
update public.vehicles set max_weight_kg = 2800 where id = '00000000-0000-0000-0000-0000000bb301';

update public.vehicles set verified_at = now() where company_id = '00000000-0000-0000-0000-0000000aa301';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  1, 'once an admin has verified it, the vehicle is quoted');

-- Over 2.5 t, cross-border needs a tachograph AND an operator licence (COMPLIANCE §5, §11) -----
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'LARGE_VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb303'),
  0, 'a verified vehicle over 2.5 t without tachograph and licence is not quoted cross-border');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'LARGE_VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb303'),
  1, 'the same vehicle is still quoted inside its own country');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'TRUCK')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb302'),
  0, 'a verified truck without tachograph and licence is not quoted cross-border');

-- The mover can't talk their way around it ------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d301","role":"authenticated"}', true);
select throws_ok(
  $$ update public.vehicles set max_weight_kg = 2000 where id = '00000000-0000-0000-0000-0000000bb302' $$,
  '23514', null, 'a mover cannot declare their truck 2000 kg to skip the tachograph and licence checks');

update public.vehicles set max_weight_kg = 2400 where id = '00000000-0000-0000-0000-0000000bb301';
select is((select verified_at from public.vehicles where id = '00000000-0000-0000-0000-0000000bb301'),
  null, 'changing the weight sends the vehicle back to verification');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  0, 'a van declared lighter is not quoted cross-border on the mover''s word');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  0, 'nor inside its country, until an admin checks it again');
update public.vehicles set verified_at = now() where id = '00000000-0000-0000-0000-0000000bb301';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  1, 'once an admin has checked the new weight, the van goes cross-border with CMR insurance');

-- Each checked fact counts on its own; other edits keep the verification.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d301","role":"authenticated"}', true);
update public.vehicles set plate = 'TEST-VV-1B' where id = '00000000-0000-0000-0000-0000000bb301';
select is((select verified_at from public.vehicles where id = '00000000-0000-0000-0000-0000000bb301'),
  null, 'changing the plate sends the vehicle back to verification');
reset role;
select set_config('request.jwt.claims', '', true);
update public.vehicles set verified_at = clock_timestamp() where id = '00000000-0000-0000-0000-0000000bb301';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d301","role":"authenticated"}', true);
update public.vehicles set tachograph = true where id = '00000000-0000-0000-0000-0000000bb301';
select is((select verified_at from public.vehicles where id = '00000000-0000-0000-0000-0000000bb301'),
  null, 'changing the tachograph sends the vehicle back to verification');
reset role;
select set_config('request.jwt.claims', '', true);
update public.vehicles set verified_at = clock_timestamp() where id = '00000000-0000-0000-0000-0000000bb301';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d301","role":"authenticated"}', true);
update public.vehicles set class = 'LARGE_VAN' where id = '00000000-0000-0000-0000-0000000bb301';
select is((select verified_at from public.vehicles where id = '00000000-0000-0000-0000-0000000bb301'),
  null, 'changing the class sends the vehicle back to verification');
reset role;
select set_config('request.jwt.claims', '', true);
update public.vehicles set class = 'VAN', verified_at = clock_timestamp() where id = '00000000-0000-0000-0000-0000000bb301';
select isnt((select verified_at from public.vehicles where id = '00000000-0000-0000-0000-0000000bb301'),
  null, 'an admin who corrects a fact and records the check in the same update keeps the vehicle verified');
update public.vehicles set tachograph = false where id = '00000000-0000-0000-0000-0000000bb301';
select is((select verified_at from public.vehicles where id = '00000000-0000-0000-0000-0000000bb301'),
  null, 'a platform-side change without a new check clears the verification too');
update public.vehicles set verified_at = clock_timestamp() where id = '00000000-0000-0000-0000-0000000bb301';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d301","role":"authenticated"}', true);
update public.vehicles set volume_m3 = 6.5, has_tail_lift = true, active = false where id = '00000000-0000-0000-0000-0000000bb301';
update public.vehicles set active = true where id = '00000000-0000-0000-0000-0000000bb301';
select isnt((select verified_at from public.vehicles where id = '00000000-0000-0000-0000-0000000bb301'),
  null, 'volume, tail lift and switching the vehicle off and on keep the verification');
reset role;
select set_config('request.jwt.claims', '', true);

-- Documents must be valid on the move date, not only today (COMPLIANCE §5) -----------------
update public.mover_documents set expires_at = now() + interval '10 days'
where company_id = '00000000-0000-0000-0000-0000000aa301' and type = 'insurance';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN', false, now() + interval '5 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  1, 'insurance valid on the move date: quoted');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN', false, now() + interval '20 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  0, 'insurance that expires before the move date excludes the vehicle (COMPLIANCE §5)');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  1, 'without a move date, insurance must be valid today');
update public.mover_documents set expires_at = now() - interval '1 day'
where company_id = '00000000-0000-0000-0000-0000000aa301' and type = 'insurance';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN', false, now() - interval '2 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  0, 'a move date in the past never brings expired insurance back');
update public.mover_documents set expires_at = now() + interval '1 year'
where company_id = '00000000-0000-0000-0000-0000000aa301' and type = 'insurance';

update public.mover_documents set expires_at = now() + interval '10 days'
where company_id = '00000000-0000-0000-0000-0000000aa301' and type = 'cmr';
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'VAN', false, now() + interval '20 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  0, 'CMR insurance that expires before the move date blocks the cross-border job');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN', false, now() + interval '20 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb301'),
  1, 'the same mover is still quoted inside their country on that date');
update public.mover_documents set expires_at = now() + interval '1 year'
where company_id = '00000000-0000-0000-0000-0000000aa301' and type = 'cmr';

-- Over 2.5 t with a tachograph: the operator licence must last until the move too.
update public.vehicles set tachograph = true, verified_at = clock_timestamp() where id = '00000000-0000-0000-0000-0000000bb303';
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000aa301', 'licence', 'aa301/licence.pdf', now() + interval '10 days', now());
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'LARGE_VAN', false, now() + interval '5 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb303'),
  1, 'with tachograph and a licence valid on the move date, a vehicle over 2.5 t goes cross-border');
select is(
  (select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'ES', 'LARGE_VAN', false, now() + interval '20 days')
   where vehicle_id = '00000000-0000-0000-0000-0000000bb303'),
  0, 'an operator licence that expires before the move date blocks cross-border jobs over 2.5 t');

-- The vehicles already on file ---------------------------------------------------------------
select is(
  (select count(*)::int from public.vehicles v join public.mover_companies c on c.id = v.company_id
   where c.is_test and c.verification_status = 'verified' and v.verified_at is null),
  0, 'the test movers'' vehicles were verified by the migration');

set local role authenticated;
select throws_ok(
  $$ select * from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN', false, now()) $$,
  '42501', null, 'only the server can list quotable vehicles for a move date');

select * from finish();
rollback;
