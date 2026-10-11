-- TEST DATA — every country has its own price level (owner request 2026-10-12). Re-prices the test
-- movers from the researched reference rates in packages/shared/src/market-rates.ts
-- (suggestedRateCard(country, class, moverFactor) — values generated from that file), switches
-- Tirana to lek, and adds test movers in Skopje (denar), Vienna and Zurich (franc). All is_test;
-- removed before launch with:  delete from public.mover_companies where is_test;

update public.rate_cards rc
set currency = v.currency::public.currency_code,
    base_fee = v.base_fee,
    per_km = v.per_km,
    per_labor_minute_1_helper = v.m1,
    per_labor_minute_2_helpers = v.m2,
    per_labor_minute_3_helpers = v.m3,
    min_price = v.min_price,
    floor_without_lift_fee = v.floor_fee,
    heavy_item_fee = v.heavy_fee,
    assembly_per_item = v.assembly
from (values
  ('7e57a000-0000-4000-8000-000000000101', 'EUR', 1500, 38, 23, 36, 50, 2600, 180, 360, 540),             -- Prishtina SMALL
  ('7e57a000-0000-4000-8000-000000000102', 'EUR', 2000, 50, 25, 40, 55, 3500, 200, 400, 600),             -- Prishtina VAN
  ('7e57a000-0000-4000-8000-000000000103', 'EUR', 2600, 65, 28, 44, 61, 4600, 220, 440, 660),             -- Prishtina LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000201', 'EUR', 1900, 47, 23, 37, 51, 3300, 186, 372, 558),             -- Prizren VAN (×0.93)
  ('7e57a000-0000-4000-8000-000000000202', 'EUR', 3200, 79, 29, 47, 64, 5500, 233, 465, 698),             -- Prizren BOX (×0.93)
  ('7e57a000-0000-4000-8000-000000000301', 'EUR', 2800, 69, 29, 47, 64, 4800, 233, 466, 700),             -- Ferizaj LARGE_VAN (×1.06)
  ('7e57a000-0000-4000-8000-000000000302', 'EUR', 5100, 127, 37, 59, 82, 8900, 297, 594, 890),            -- Ferizaj TRUCK (×1.06)
  ('7e57a000-0000-4000-8000-000000000401', 'ALL', 200000, 6000, 2700, 4300, 6000, 350000, 20000, 40000, 60000), -- Tirana VAN (lek)
  ('7e57a000-0000-4000-8000-000000000402', 'ALL', 260000, 7800, 2970, 4730, 6600, 455000, 22000, 44000, 66000), -- Tirana LARGE_VAN (lek)
  ('7e57a000-0000-4000-8000-000000000501', 'PLN', 7500, 225, 180, 360, 450, 18800, 1350, 3600, 5400),     -- Warszawa SMALL
  ('7e57a000-0000-4000-8000-000000000502', 'PLN', 10000, 300, 200, 400, 500, 25000, 1500, 4000, 6000),    -- Warszawa VAN
  ('7e57a000-0000-4000-8000-000000000503', 'PLN', 13000, 390, 220, 440, 550, 32500, 1650, 4400, 6600),    -- Warszawa LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000601', 'EUR', 7800, 117, 74, 146, 211, 19500, 880, 1650, 2750),       -- München LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000602', 'EUR', 10200, 153, 84, 166, 240, 25500, 1000, 1875, 3125)     -- München BOX
) as v (vehicle_id, currency, base_fee, per_km, m1, m2, m3, min_price, floor_fee, heavy_fee, assembly)
where rc.vehicle_id = v.vehicle_id::uuid;

-- New test movers ------------------------------------------------------------

insert into public.mover_companies
  (id, legal_name, registration_no, tax_id, tax_residency_country, address, country,
   contact_phone, contact_email, is_business, verification_status, stripe_onboarding_complete,
   self_certification_at, is_test)
values
  ('7e570000-0000-4000-8000-000000000007', 'Test Selidbi Skopje', 'TEST-MK-007', 'TEST-MK-007', 'MK', 'Test address, Skopje', 'MK', '+38970000907', 'test-skopje@example.com', true, 'verified', true, now(), true),
  ('7e570000-0000-4000-8000-000000000008', 'Test Umzüge Wien', 'TEST-AT-008', 'TEST-AT-008', 'AT', 'Test address, Wien', 'AT', '+43660000908', 'test-wien@example.com', true, 'verified', true, now(), true),
  ('7e570000-0000-4000-8000-000000000009', 'Test Zügeln Zürich', 'TEST-CH-009', 'TEST-CH-009', 'CH', 'Test address, Zürich', 'CH', '+41790000909', 'test-zuerich@example.com', true, 'verified', true, now(), true);

insert into public.service_areas (company_id, label, center, radius_km)
values
  ('7e570000-0000-4000-8000-000000000007', 'Skopje + 60 km', 'SRID=4326;POINT(21.4254 41.9981)', 60),
  ('7e570000-0000-4000-8000-000000000008', 'Wien + 200 km', 'SRID=4326;POINT(16.3738 48.2082)', 200),
  ('7e570000-0000-4000-8000-000000000009', 'Zürich + 100 km', 'SRID=4326;POINT(8.5417 47.3769)', 100);

-- Insurance for all three; Vienna and Zurich also do corridor jobs to the Balkans (CMR + licence).
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values
  ('7e570000-0000-4000-8000-000000000007', 'insurance', 'test/insurance.pdf', '2027-12-31 23:59:59+00', now()),
  ('7e570000-0000-4000-8000-000000000008', 'insurance', 'test/insurance.pdf', '2027-12-31 23:59:59+00', now()),
  ('7e570000-0000-4000-8000-000000000008', 'cmr', 'test/cmr.pdf', '2027-12-31 23:59:59+00', now()),
  ('7e570000-0000-4000-8000-000000000008', 'licence', 'test/licence.pdf', null, now()),
  ('7e570000-0000-4000-8000-000000000009', 'insurance', 'test/insurance.pdf', '2027-12-31 23:59:59+00', now()),
  ('7e570000-0000-4000-8000-000000000009', 'cmr', 'test/cmr.pdf', '2027-12-31 23:59:59+00', now()),
  ('7e570000-0000-4000-8000-000000000009', 'licence', 'test/licence.pdf', null, now());

insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, has_tail_lift, tachograph)
values
  ('7e57a000-0000-4000-8000-000000000701', '7e570000-0000-4000-8000-000000000007', 'VAN', 'SK-TEST-701', 2800, 6.0, false, false),
  ('7e57a000-0000-4000-8000-000000000702', '7e570000-0000-4000-8000-000000000007', 'LARGE_VAN', 'SK-TEST-702', 3500, 13.0, false, false),
  ('7e57a000-0000-4000-8000-000000000801', '7e570000-0000-4000-8000-000000000008', 'LARGE_VAN', 'W-TEST-801', 3500, 14.0, false, true),
  ('7e57a000-0000-4000-8000-000000000802', '7e570000-0000-4000-8000-000000000008', 'BOX', 'W-TEST-802', 3500, 21.0, true, true),
  ('7e57a000-0000-4000-8000-000000000901', '7e570000-0000-4000-8000-000000000009', 'VAN', 'ZH-TEST-901', 2800, 6.0, false, false),
  ('7e57a000-0000-4000-8000-000000000902', '7e570000-0000-4000-8000-000000000009', 'LARGE_VAN', 'ZH-TEST-902', 3500, 14.0, false, true);

-- Zurich's large van has a EUR card: corridor jobs are priced in EUR only (COMPLIANCE §11).
insert into public.rate_cards
  (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, per_labor_minute_2_helpers,
   per_labor_minute_3_helpers, min_price, floor_without_lift_fee, heavy_item_fee, assembly_per_item,
   long_distance_threshold_km, long_distance_per_km, confirmed_by_mover_at)
values
  ('7e57a000-0000-4000-8000-000000000701', 'MKD', 120000, 3500, 1500, 3000, 4200, 250000, 12000, 25000, 35000, null, 0, now()), -- Skopje VAN
  ('7e57a000-0000-4000-8000-000000000702', 'MKD', 156000, 4550, 1650, 3300, 4620, 325000, 13200, 27500, 38500, null, 0, now()), -- Skopje LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000801', 'EUR', 6500, 111, 69, 132, 187, 16900, 770, 1540, 2420, null, 0, now()),             -- Wien LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000802', 'EUR', 8500, 145, 79, 150, 213, 22100, 875, 1750, 2750, null, 0, now()),             -- Wien BOX
  ('7e57a000-0000-4000-8000-000000000901', 'CHF', 10000, 150, 125, 233, 325, 28000, 1500, 3000, 4500, null, 0, now()),          -- Zürich VAN
  ('7e57a000-0000-4000-8000-000000000902', 'EUR', 13000, 195, 138, 256, 358, 36400, 1650, 3300, 4950, null, 0, now());          -- Zürich LARGE_VAN (EUR)
