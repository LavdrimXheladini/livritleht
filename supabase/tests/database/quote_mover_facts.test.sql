begin;
select plan(8);

-- Terms published on the project would leave these sample movers unquoted until they accept them
-- (20261016100000, tested in terms.test.sql): set aside here, like everything else (rolled back).
delete from public.terms_acceptances;
delete from public.terms_notices;
delete from public.terms_versions;

-- Quotes say who each mover is (migration 20261015120000, COMPLIANCE §4): business or private person,
-- the registration number (businesses only), the town, and until when the checked insurance runs.
-- Fixtures written by the platform (service role): two quotable movers in Lisbon, far from every test
-- mover — a business and a private person.
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d401', '48500000401', '{"locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000d402', '48500000402', '{"locale":"pl"}');
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d401', '00000000-0000-0000-0000-00000000d402');

insert into public.mover_companies
  (id, owner_id, legal_name, registration_no, country, is_business, verification_status, stripe_onboarding_complete, address_details,
   cancel_free_hours, cancel_late_pct)
values
  ('00000000-0000-0000-0000-0000000aa401', '00000000-0000-0000-0000-00000000d401', 'Lisboa Mudanças Lda', '515000001', 'PT', true, 'verified', true,
   '{"street":"Rua Augusta","houseNumber":"10","city":"Lisboa","countryCode":"PT","lat":38.71,"lon":-9.137}', 48, 50),
  ('00000000-0000-0000-0000-0000000aa402', '00000000-0000-0000-0000-00000000d402', 'Ana Costa', 'SHOULD-NOT-SHOW', 'PT', false, 'verified', true, null, 24, 0);

insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, verified_at)
values
  ('00000000-0000-0000-0000-0000000bb401', '00000000-0000-0000-0000-0000000aa401', 'VAN', 'TEST-PT-401', 2800, 6, now()),
  ('00000000-0000-0000-0000-0000000bb402', '00000000-0000-0000-0000-0000000aa402', 'VAN', 'TEST-PT-402', 2800, 6, now());
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
values
  ('00000000-0000-0000-0000-0000000bb401', 'EUR', 2500, 60, 28, now()),
  ('00000000-0000-0000-0000-0000000bb402', 'EUR', 2000, 50, 25, now());
insert into public.service_areas (company_id, center, radius_km)
values
  ('00000000-0000-0000-0000-0000000aa401', 'SRID=4326;POINT(-9.1393 38.7223)', 40),
  ('00000000-0000-0000-0000-0000000aa402', 'SRID=4326;POINT(-9.1393 38.7223)', 40);
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values
  ('00000000-0000-0000-0000-0000000aa401', 'insurance', '00000000-0000-0000-0000-0000000aa401/insurance/a.pdf', '2030-06-30 21:59:59+00', now()),
  ('00000000-0000-0000-0000-0000000aa402', 'insurance', '00000000-0000-0000-0000-0000000aa402/insurance/b.pdf', '2029-01-31 22:59:59+00', now());

create temporary table offers on commit drop as
select * from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
where company_id in ('00000000-0000-0000-0000-0000000aa401', '00000000-0000-0000-0000-0000000aa402');

select is((select count(*)::int from offers), 2, 'both movers are quoted');
select is((select is_business from offers where company_id = '00000000-0000-0000-0000-0000000aa401'), true,
  'an offer says the mover is a business (COMPLIANCE §4)');
select is((select registration_no from offers where company_id = '00000000-0000-0000-0000-0000000aa401'), '515000001',
  'a business shows its registration number');
select is((select town from offers where company_id = '00000000-0000-0000-0000-0000000aa401'), 'Lisboa',
  'the town comes from the address found on the map');
select is((select insurance_until from offers where company_id = '00000000-0000-0000-0000-0000000aa401'),
  '2030-06-30 21:59:59+00'::timestamptz, 'the end date of the checked insurance is shown');
select is((select is_business from offers where company_id = '00000000-0000-0000-0000-0000000aa402'), false,
  'a private person is quoted as not a business');
select is((select registration_no from offers where company_id = '00000000-0000-0000-0000-0000000aa402'), null,
  'a private person shows no registration number');

set local role anon;
select throws_ok(
  $$ select * from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN') $$,
  '42501', null, 'visitors cannot call it directly (only the quote function, as the service role)');

select * from finish();
rollback;
