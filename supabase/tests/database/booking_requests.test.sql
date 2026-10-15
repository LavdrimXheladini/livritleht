begin;
select plan(16);

-- Migration 20261015130000: movers' own cancellation terms, and booking requests (jobs + quotes) that
-- only the server writes and only their customer reads. Fixtures by the platform (service role): a
-- verified mover in Lisbon (far from every test mover) without terms yet, and two customers.
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d501', '48500000501', '{"locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000c501', '38344000501', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000c502', '38344000502', '{"locale":"sq"}');
update public.profiles set role = 'mover' where id = '00000000-0000-0000-0000-00000000d501';
update public.profiles set role = 'customer' where id in ('00000000-0000-0000-0000-00000000c501', '00000000-0000-0000-0000-00000000c502');

insert into public.mover_companies (id, owner_id, legal_name, country, is_business, verification_status, stripe_onboarding_complete)
values ('00000000-0000-0000-0000-0000000aa501', '00000000-0000-0000-0000-00000000d501', 'Belém Mudanças Lda', 'PT', true, 'verified', true);
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, verified_at)
values ('00000000-0000-0000-0000-0000000bb501', '00000000-0000-0000-0000-0000000aa501', 'VAN', 'TEST-PT-501', 2800, 6, now());
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
values ('00000000-0000-0000-0000-0000000bb501', 'EUR', 2500, 60, 28, now());
insert into public.service_areas (company_id, center, radius_km)
values ('00000000-0000-0000-0000-0000000aa501', 'SRID=4326;POINT(-9.1393 38.7223)', 40);
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000aa501', 'insurance', '00000000-0000-0000-0000-0000000aa501/insurance/a.pdf', now() + interval '1 year', now());

create function pg_temp.quoted() returns text language sql as $$
  select coalesce(string_agg(cancel_free_hours || '/' || cancel_late_pct, ','), 'none')
  from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
  where vehicle_id = '00000000-0000-0000-0000-0000000bb501'
$$;

-- 1. Cancellation terms ------------------------------------------------------------------------
select is(pg_temp.quoted(), 'none', 'a mover without cancellation terms is not offered (COMPLIANCE §8)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d501","role":"authenticated"}', true);
select lives_ok(
  $$ update public.mover_companies set cancel_free_hours = 72, cancel_late_pct = 25 where id = '00000000-0000-0000-0000-0000000aa501' $$,
  'the mover sets their own cancellation terms');
select throws_ok(
  $$ update public.mover_companies set cancel_free_hours = 12 where id = '00000000-0000-0000-0000-0000000aa501' $$,
  '23514', null, 'only the fixed choices (1, 2, 3 or 7 days)');
select throws_ok(
  $$ update public.mover_companies set cancel_late_pct = null where id = '00000000-0000-0000-0000-0000000aa501' $$,
  '23514', null, 'both parts of the terms, or none');
select is((select verification_status::text from public.mover_companies where id = '00000000-0000-0000-0000-0000000aa501'), 'verified',
  'changing the terms does not send the company back to the check');
reset role;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.quoted(), '72/25', 'with terms the mover is offered, and the offer carries the terms');

-- 2. Booking requests ----------------------------------------------------------------------------
select is((select bool_and(rowsecurity) from pg_tables where schemaname = 'public' and tablename in ('jobs', 'quotes')), true,
  'RLS is on for jobs and quotes');

-- What the `book` function saves (service role).
insert into public.jobs (id, customer_id, type, vehicle_class, helpers, scheduled_at,
  pickup_area, pickup_country, pickup_label, pickup_point, pickup_details, pickup_floor, pickup_has_lift,
  dropoff_area, dropoff_country, dropoff_label, dropoff_street, dropoff_house_number, dropoff_point, dropoff_floor, dropoff_has_lift,
  items, distance_km, est_labor_min, chosen_mover_company_id, chosen_vehicle_id)
values ('00000000-0000-0000-0000-0000000e0501', '00000000-0000-0000-0000-00000000c501', 'SMALL_MOVE', 'VAN', 2, now() + interval '2 days',
  'Lisboa', 'PT', 'Lisboa', 'SRID=4326;POINT(-9.15 38.71)', 'Block B, entrance 2', 3, false,
  'Lisboa', 'PT', 'Rua Augusta 10, Lisboa', 'Rua Augusta', '10', 'SRID=4326;POINT(-9.137 38.71)', 0, false,
  '[{"key":"sofa3","qty":1,"assembly":false}]', 3.2, 45,
  '00000000-0000-0000-0000-0000000aa501', '00000000-0000-0000-0000-0000000bb501');
insert into public.quotes (job_id, vehicle_id, mover_company_id, currency, line_items, mover_price, booking_fee, total,
  take_rate_pct, platform_commission, mover_payout, cancel_free_hours, cancel_late_pct, expires_at)
values ('00000000-0000-0000-0000-0000000e0501', '00000000-0000-0000-0000-0000000bb501', '00000000-0000-0000-0000-0000000aa501', 'EUR',
  '[{"kind":"base","amount":2500}]', 5000, null, 5000, 20, 1000, 4000, 72, 25, now() + interval '15 minutes');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c501","role":"authenticated"}', true);
select is((select count(*)::int from public.jobs), 1, 'the customer reads their own booking request');
select is((select count(*)::int from public.quotes), 1, '…and its quote');
select throws_ok(
  $$ insert into public.jobs (customer_id, type, vehicle_class, helpers, scheduled_at, pickup_area, pickup_country, pickup_label,
       pickup_point, pickup_floor, pickup_has_lift, dropoff_area, dropoff_country, dropoff_label, dropoff_point, dropoff_floor,
       dropoff_has_lift, items, distance_km, est_labor_min, chosen_mover_company_id, chosen_vehicle_id)
     values ('00000000-0000-0000-0000-00000000c501', 'ITEM', 'VAN', 1, now(), 'X', 'PT', 'X', 'SRID=4326;POINT(0 0)', 0, true,
       'Y', 'PT', 'Y', 'SRID=4326;POINT(1 1)', 0, true, '[{"key":"box","qty":1,"assembly":false}]', 1, 1,
       '00000000-0000-0000-0000-0000000aa501', '00000000-0000-0000-0000-0000000bb501') $$,
  '42501', null, 'customers cannot write jobs themselves (only the book function, which prices on the server)');
select throws_ok(
  $$ update public.quotes set mover_price = 1 $$,
  '42501', null, 'nor change a price');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c502","role":"authenticated"}', true);
select is((select count(*)::int from public.jobs), 0, 'another customer sees none of it');
select is((select count(*)::int from public.quotes), 0, '…nor its quote');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d501","role":"authenticated"}', true);
select is((select count(*)::int from public.jobs), 0,
  'the chosen mover does not see the request (not booked yet; the address only after accepting, COMPLIANCE §9.1)');

set local role anon;
select throws_ok($$ select * from public.jobs $$, '42501', null, 'visitors cannot read jobs');

reset role;
select set_config('request.jwt.claims', '', true);
delete from auth.users where id = '00000000-0000-0000-0000-00000000c501';
select is((select count(*)::int from public.jobs where id = '00000000-0000-0000-0000-0000000e0501'), 0,
  'a deleted account takes its unbooked requests with it');

select * from finish();
rollback;
