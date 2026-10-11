-- TEST DATA — sample movers for development in the cloud project (design/DECISIONS.md #7).
-- Every company is is_test = true: the quote function only uses them while test movers are
-- enabled, and they must be removed before launch:
--     delete from public.mover_companies where is_test;   -- cascades to everything below
-- Rates are invented sample values (cents), confirmed here because they are test data.

insert into public.mover_companies
  (id, legal_name, registration_no, tax_id, tax_residency_country, address, country,
   contact_phone, contact_email, is_business, verification_status, stripe_onboarding_complete,
   self_certification_at, is_test)
values
  ('7e570000-0000-4000-8000-000000000001', 'Test Movers Prishtina', 'TEST-XK-001', 'TEST-XK-001', 'XK', 'Test address, Prishtina', 'XK', '+38344000901', 'test-prishtina@example.com', true, 'verified', true, now(), true),
  ('7e570000-0000-4000-8000-000000000002', 'Test Transport Prizren', 'TEST-XK-002', 'TEST-XK-002', 'XK', 'Test address, Prizren', 'XK', '+38344000902', 'test-prizren@example.com', true, 'verified', true, now(), true),
  ('7e570000-0000-4000-8000-000000000003', 'Test Logistics Ferizaj', 'TEST-XK-003', 'TEST-XK-003', 'XK', 'Test address, Ferizaj', 'XK', '+38344000903', 'test-ferizaj@example.com', true, 'verified', true, now(), true),
  ('7e570000-0000-4000-8000-000000000004', 'Test Movers Tirana', 'TEST-AL-004', 'TEST-AL-004', 'AL', 'Test address, Tirana', 'AL', '+35569000904', 'test-tirana@example.com', true, 'verified', true, now(), true),
  ('7e570000-0000-4000-8000-000000000005', 'Test Przeprowadzki Warszawa', 'TEST-PL-005', 'TEST-PL-005', 'PL', 'Test address, Warszawa', 'PL', '+48500000905', 'test-warszawa@example.com', true, 'verified', true, now(), true),
  ('7e570000-0000-4000-8000-000000000006', 'Test Diaspora Lines München', 'TEST-DE-006', 'TEST-DE-006', 'DE', 'Test address, München', 'DE', '+4915100000906', 'test-muenchen@example.com', true, 'verified', true, now(), true);

-- Where each company picks up.
insert into public.service_areas (company_id, label, center, radius_km)
values
  ('7e570000-0000-4000-8000-000000000001', 'Prishtina + 90 km', 'SRID=4326;POINT(21.1655 42.6629)', 90),
  ('7e570000-0000-4000-8000-000000000002', 'Prizren + 80 km', 'SRID=4326;POINT(20.7397 42.2139)', 80),
  ('7e570000-0000-4000-8000-000000000003', 'Ferizaj + 150 km', 'SRID=4326;POINT(21.1553 42.3702)', 150),
  ('7e570000-0000-4000-8000-000000000004', 'Tirana + 120 km', 'SRID=4326;POINT(19.8187 41.3275)', 120),
  ('7e570000-0000-4000-8000-000000000005', 'Warszawa + 60 km', 'SRID=4326;POINT(21.0122 52.2297)', 60),
  ('7e570000-0000-4000-8000-000000000006', 'München + 250 km', 'SRID=4326;POINT(11.582 48.1351)', 250),
  ('7e570000-0000-4000-8000-000000000006', 'Stuttgart + 120 km', 'SRID=4326;POINT(9.1829 48.7758)', 120);

-- Verified documents (placeholder paths, no files). Ferizaj and München can do cross-border jobs.
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
select c.id, d.type::public.mover_document_type, 'test/' || d.type || '.pdf', d.expires_at, now()
from (values
  ('7e570000-0000-4000-8000-000000000001'::uuid),
  ('7e570000-0000-4000-8000-000000000002'::uuid),
  ('7e570000-0000-4000-8000-000000000003'::uuid),
  ('7e570000-0000-4000-8000-000000000004'::uuid),
  ('7e570000-0000-4000-8000-000000000005'::uuid),
  ('7e570000-0000-4000-8000-000000000006'::uuid)
) as c (id)
cross join (values ('insurance', timestamptz '2027-12-31 23:59:59+00')) as d (type, expires_at)
union all
select c.id, d.type::public.mover_document_type, 'test/' || d.type || '.pdf', d.expires_at, now()
from (values
  ('7e570000-0000-4000-8000-000000000003'::uuid),
  ('7e570000-0000-4000-8000-000000000006'::uuid)
) as c (id)
cross join (values
  ('cmr', timestamptz '2027-12-31 23:59:59+00'),
  ('licence', null::timestamptz)
) as d (type, expires_at);

-- Vehicles + their rate cards.
with v (id, company_id, class, plate, max_weight_kg, volume_m3, has_tail_lift, tachograph) as (
  values
    ('7e57a000-0000-4000-8000-000000000101'::uuid, '7e570000-0000-4000-8000-000000000001'::uuid, 'SMALL', '01-TEST-101', 2200, 3.0, false, false),
    ('7e57a000-0000-4000-8000-000000000102'::uuid, '7e570000-0000-4000-8000-000000000001'::uuid, 'VAN', '01-TEST-102', 2800, 6.0, false, false),
    ('7e57a000-0000-4000-8000-000000000103'::uuid, '7e570000-0000-4000-8000-000000000001'::uuid, 'LARGE_VAN', '01-TEST-103', 3500, 13.0, false, false),
    ('7e57a000-0000-4000-8000-000000000201'::uuid, '7e570000-0000-4000-8000-000000000002'::uuid, 'VAN', '04-TEST-201', 2800, 6.5, false, false),
    ('7e57a000-0000-4000-8000-000000000202'::uuid, '7e570000-0000-4000-8000-000000000002'::uuid, 'BOX', '04-TEST-202', 3500, 20.0, true, false),
    ('7e57a000-0000-4000-8000-000000000301'::uuid, '7e570000-0000-4000-8000-000000000003'::uuid, 'LARGE_VAN', '05-TEST-301', 3500, 14.0, false, true),
    ('7e57a000-0000-4000-8000-000000000302'::uuid, '7e570000-0000-4000-8000-000000000003'::uuid, 'TRUCK', '05-TEST-302', 7500, 36.0, true, true),
    ('7e57a000-0000-4000-8000-000000000401'::uuid, '7e570000-0000-4000-8000-000000000004'::uuid, 'VAN', 'AA-TEST-401', 2800, 6.0, false, false),
    ('7e57a000-0000-4000-8000-000000000402'::uuid, '7e570000-0000-4000-8000-000000000004'::uuid, 'LARGE_VAN', 'AA-TEST-402', 3500, 12.5, false, false),
    ('7e57a000-0000-4000-8000-000000000501'::uuid, '7e570000-0000-4000-8000-000000000005'::uuid, 'SMALL', 'WA-TEST-501', 2100, 3.0, false, false),
    ('7e57a000-0000-4000-8000-000000000502'::uuid, '7e570000-0000-4000-8000-000000000005'::uuid, 'VAN', 'WA-TEST-502', 2800, 6.0, false, false),
    ('7e57a000-0000-4000-8000-000000000503'::uuid, '7e570000-0000-4000-8000-000000000005'::uuid, 'LARGE_VAN', 'WA-TEST-503', 3500, 13.0, false, false),
    ('7e57a000-0000-4000-8000-000000000601'::uuid, '7e570000-0000-4000-8000-000000000006'::uuid, 'LARGE_VAN', 'M-TEST-601', 3500, 14.0, false, true),
    ('7e57a000-0000-4000-8000-000000000602'::uuid, '7e570000-0000-4000-8000-000000000006'::uuid, 'BOX', 'M-TEST-602', 3500, 21.0, true, true)
)
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, has_tail_lift, tachograph)
select id, company_id, class::public.vehicle_class, plate, max_weight_kg, volume_m3, has_tail_lift, tachograph from v;

insert into public.rate_cards
  (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, per_labor_minute_2_helpers,
   per_labor_minute_3_helpers, min_price, floor_without_lift_fee, heavy_item_fee, assembly_per_item,
   long_distance_threshold_km, long_distance_per_km, confirmed_by_mover_at)
values
  -- Test Movers Prishtina (EUR)
  ('7e57a000-0000-4000-8000-000000000101', 'EUR', 1500, 45, 22, 40, null, 2500, 150, 300, 400, null, 0, now()),
  ('7e57a000-0000-4000-8000-000000000102', 'EUR', 2500, 60, 28, 48, 66, 3500, 200, 400, 600, null, 0, now()),
  ('7e57a000-0000-4000-8000-000000000103', 'EUR', 3500, 80, 33, 58, 80, 5000, 250, 500, 700, null, 0, now()),
  -- Test Transport Prizren (EUR)
  ('7e57a000-0000-4000-8000-000000000201', 'EUR', 2200, 65, 30, 50, 70, 3000, 200, 400, 500, null, 0, now()),
  ('7e57a000-0000-4000-8000-000000000202', 'EUR', 4500, 100, 38, 65, 90, 7000, 300, 600, 800, null, 0, now()),
  -- Test Logistics Ferizaj (EUR, cross-border)
  ('7e57a000-0000-4000-8000-000000000301', 'EUR', 4000, 75, 32, 55, 78, 5500, 250, 500, 700, null, 0, now()),
  ('7e57a000-0000-4000-8000-000000000302', 'EUR', 7500, 130, 45, 80, 110, 12000, 400, 800, 1000, null, 0, now()),
  -- Test Movers Tirana (EUR)
  ('7e57a000-0000-4000-8000-000000000401', 'EUR', 2400, 62, 27, 47, 65, 3200, 200, 400, 500, null, 0, now()),
  ('7e57a000-0000-4000-8000-000000000402', 'EUR', 3800, 85, 34, 58, 82, 5200, 250, 500, 700, null, 0, now()),
  -- Test Przeprowadzki Warszawa (PLN)
  ('7e57a000-0000-4000-8000-000000000501', 'PLN', 9000, 250, 150, 270, null, 15000, 800, 1500, 2000, null, 0, now()),
  ('7e57a000-0000-4000-8000-000000000502', 'PLN', 15000, 320, 180, 320, 450, 22000, 1000, 2000, 3000, null, 0, now()),
  ('7e57a000-0000-4000-8000-000000000503', 'PLN', 22000, 400, 210, 380, 540, 32000, 1500, 2500, 3500, null, 0, now()),
  -- Test Diaspora Lines München (EUR, cross-border)
  ('7e57a000-0000-4000-8000-000000000601', 'EUR', 9000, 95, 75, 130, 180, 15000, 800, 1500, 2500, null, 0, now()),
  ('7e57a000-0000-4000-8000-000000000602', 'EUR', 14000, 120, 85, 150, 210, 22000, 1000, 1800, 3000, null, 0, now());
