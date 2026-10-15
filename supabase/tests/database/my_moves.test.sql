begin;
select plan(6);

-- Migration 20261015140000: each quote keeps the mover as the customer saw them, and a customer reads
-- their saved request's stops as coordinates (to open it again). Fixtures by the platform (service role).
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d601', '48500000601', '{"locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000c601', '38344000601', '{"locale":"sq"}');
update public.profiles set role = 'mover' where id = '00000000-0000-0000-0000-00000000d601';
update public.profiles set role = 'customer' where id = '00000000-0000-0000-0000-00000000c601';

insert into public.mover_companies (id, owner_id, legal_name, country)
values ('00000000-0000-0000-0000-0000000aa601', '00000000-0000-0000-0000-00000000d601', 'Prizren Lëvizje Shpk', 'XK');
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3)
values ('00000000-0000-0000-0000-0000000bb601', '00000000-0000-0000-0000-0000000aa601', 'VAN', 'TEST-XK-601', 2800, 6);

insert into public.jobs (id, customer_id, type, vehicle_class, helpers, scheduled_at,
  pickup_area, pickup_country, pickup_label, pickup_point, pickup_floor, pickup_has_lift,
  dropoff_area, dropoff_country, dropoff_label, dropoff_point, dropoff_floor, dropoff_has_lift,
  items, distance_km, est_labor_min, chosen_mover_company_id, chosen_vehicle_id)
values ('00000000-0000-0000-0000-0000000e0601', '00000000-0000-0000-0000-00000000c601', 'SMALL_MOVE', 'VAN', 2, now() + interval '2 days',
  'Prishtina', 'XK', 'Prishtina', 'SRID=4326;POINT(21.1655 42.6629)', 0, false,
  'Prizren', 'XK', 'Prizren', 'SRID=4326;POINT(20.7397 42.2139)', 0, false,
  '[{"key":"box","qty":5,"assembly":false}]', 83.2, 40,
  '00000000-0000-0000-0000-0000000aa601', '00000000-0000-0000-0000-0000000bb601');
insert into public.quotes (job_id, vehicle_id, mover_company_id, currency, line_items, mover_price, total,
  take_rate_pct, platform_commission, mover_payout, cancel_free_hours, cancel_late_pct, expires_at, mover)
values ('00000000-0000-0000-0000-0000000e0601', '00000000-0000-0000-0000-0000000bb601', '00000000-0000-0000-0000-0000000aa601', 'EUR',
  '[{"kind":"base","amount":2500}]', 5000, 5000, 20, 1000, 4000, 48, 50, now() + interval '15 minutes',
  '{"companyId":"00000000-0000-0000-0000-0000000aa601","name":"Prizren Lëvizje Shpk","isBusiness":true}');

select throws_ok(
  $$ insert into public.quotes (job_id, vehicle_id, mover_company_id, currency, line_items, mover_price, total,
       take_rate_pct, platform_commission, mover_payout, cancel_free_hours, cancel_late_pct, expires_at, mover)
     values ('00000000-0000-0000-0000-0000000e0601', '00000000-0000-0000-0000-0000000bb601', '00000000-0000-0000-0000-0000000aa601', 'EUR',
       '[]', 0, 0, 20, 0, 0, 48, 50, now(), '"just a name"') $$,
  '23514', null, 'the mover is kept as an object (the details the customer saw)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c601","role":"authenticated"}', true);
select is((select mover ->> 'name' from public.quotes), 'Prizren Lëvizje Shpk',
  'the customer reads whom the contract is with, as they saw it (COMPLIANCE §4)');
select is((select count(*)::int from public.mover_companies), 0, '…while the company record itself stays private');
select is(
  (select round(public.pickup_lat(j)::numeric, 4) || ',' || round(public.pickup_lon(j)::numeric, 4) from public.jobs j),
  '42.6629,21.1655', 'the pickup as coordinates, to open the request again');
select is(
  (select round(public.dropoff_lat(j)::numeric, 4) || ',' || round(public.dropoff_lon(j)::numeric, 4) from public.jobs j),
  '42.2139,20.7397', '…and the drop-off');

set local role anon;
select throws_ok($$ select public.pickup_lat(j) from public.jobs j $$, '42501', null, 'visitors get nothing');

select * from finish();
rollback;
