-- TEST DATA — crew rates that follow the market: about 1.9× a single mover's rate for a crew of 2
-- and 2.6× for a crew of 3 (packages/shared/src/market-rates.ts; values generated from that file).
-- A bigger crew now finishes sooner but costs a little more in total, as with real movers.
-- Test movers only (is_test); removed before launch.

update public.rate_cards rc
set per_labor_minute_1_helper = v.m1,
    per_labor_minute_2_helpers = v.m2,
    per_labor_minute_3_helpers = v.m3
from (values
  ('7e57a000-0000-4000-8000-000000000101', 23, 42, 59),                -- Prishtina SMALL
  ('7e57a000-0000-4000-8000-000000000102', 25, 47, 65),                -- Prishtina VAN
  ('7e57a000-0000-4000-8000-000000000103', 28, 52, 72),                -- Prishtina LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000201', 23, 44, 60),                -- Prizren VAN
  ('7e57a000-0000-4000-8000-000000000202', 29, 55, 76),                -- Prizren BOX
  ('7e57a000-0000-4000-8000-000000000301', 29, 55, 76),                -- Ferizaj LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000302', 37, 70, 96),                -- Ferizaj TRUCK
  ('7e57a000-0000-4000-8000-000000000401', 2700, 5100, 7000),          -- Tirana VAN
  ('7e57a000-0000-4000-8000-000000000402', 2970, 5610, 7700),          -- Tirana LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000501', 180, 342, 468),             -- Warszawa SMALL
  ('7e57a000-0000-4000-8000-000000000502', 200, 380, 520),             -- Warszawa VAN
  ('7e57a000-0000-4000-8000-000000000503', 220, 418, 572),             -- Warszawa LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000601', 74, 140, 191),              -- München LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000602', 84, 159, 218),              -- München BOX
  ('7e57a000-0000-4000-8000-000000000701', 1500, 2850, 3900),          -- Skopje VAN
  ('7e57a000-0000-4000-8000-000000000702', 1650, 3135, 4290),          -- Skopje LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000801', 69, 132, 180),              -- Wien LARGE_VAN
  ('7e57a000-0000-4000-8000-000000000802', 79, 150, 205),              -- Wien BOX
  ('7e57a000-0000-4000-8000-000000000901', 125, 238, 325),             -- Zürich VAN
  ('7e57a000-0000-4000-8000-000000000902', 138, 262, 358)              -- Zürich LARGE_VAN
) as v (vehicle_id, m1, m2, m3)
where rc.vehicle_id = v.vehicle_id::uuid;
