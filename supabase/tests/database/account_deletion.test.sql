begin;
select plan(13);

-- Deleting an account (the `account` function, design/DECISIONS.md #31; COMPLIANCE §9), in its order:
-- the requests customers saved with the mover, the mover's older quotes, the company, then the login.
-- This checks the database lets that order through and leaves nothing behind — and that another
-- customer's request stays. Fixtures by the platform (service role).
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d801', '48500000801', '{"locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000d802', '48500000802', '{"locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000c801', '38344000801', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000c802', '38344000802', '{"locale":"sq"}');
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d801', '00000000-0000-0000-0000-00000000d802');
update public.profiles set role = 'customer' where id in ('00000000-0000-0000-0000-00000000c801', '00000000-0000-0000-0000-00000000c802');

insert into public.mover_companies (id, owner_id, legal_name, country)
values
  ('00000000-0000-0000-0000-0000000aa801', '00000000-0000-0000-0000-00000000d801', 'Leaving Movers', 'XK'),
  ('00000000-0000-0000-0000-0000000aa802', '00000000-0000-0000-0000-00000000d802', 'Staying Movers', 'XK');
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3)
values
  ('00000000-0000-0000-0000-0000000bb801', '00000000-0000-0000-0000-0000000aa801', 'VAN', 'TEST-XK-801', 2800, 6),
  ('00000000-0000-0000-0000-0000000bb802', '00000000-0000-0000-0000-0000000aa802', 'VAN', 'TEST-XK-802', 2800, 6);
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
values ('00000000-0000-0000-0000-0000000bb801', 'EUR', 2500, 60, 28, now());
insert into public.service_areas (company_id, center, radius_km)
values ('00000000-0000-0000-0000-0000000aa801', 'SRID=4326;POINT(21.1655 42.6629)', 40);
insert into public.mover_documents (id, company_id, type, file_path, expires_at)
values ('00000000-0000-0000-0000-0000000dd801', '00000000-0000-0000-0000-0000000aa801', 'insurance', 'aa801/insurance.pdf', now() + interval '10 days');
select public.queue_document_reminders();
insert into public.phone_verifications (user_id, phone, channel, verified_at)
values ('00000000-0000-0000-0000-00000000d801', '+38344000801', 'test', now());

-- c801 saved a request with the leaving mover; c802's request moved on to the staying mover but kept
-- the leaving mover's earlier quote.
insert into public.jobs (id, customer_id, type, vehicle_class, helpers, scheduled_at,
  pickup_area, pickup_country, pickup_label, pickup_point, pickup_floor, pickup_has_lift,
  dropoff_area, dropoff_country, dropoff_label, dropoff_point, dropoff_floor, dropoff_has_lift,
  items, distance_km, est_labor_min, chosen_mover_company_id, chosen_vehicle_id)
values
  ('00000000-0000-0000-0000-0000000e0801', '00000000-0000-0000-0000-00000000c801', 'SMALL_MOVE', 'VAN', 2, now() + interval '2 days',
   'Prishtina', 'XK', 'Prishtina', 'SRID=4326;POINT(21.1655 42.6629)', 0, false,
   'Prizren', 'XK', 'Prizren', 'SRID=4326;POINT(20.7397 42.2139)', 0, false,
   '[{"key":"box","qty":5,"assembly":false}]', 83.2, 40, '00000000-0000-0000-0000-0000000aa801', '00000000-0000-0000-0000-0000000bb801'),
  ('00000000-0000-0000-0000-0000000e0802', '00000000-0000-0000-0000-00000000c802', 'SMALL_MOVE', 'VAN', 2, now() + interval '2 days',
   'Prishtina', 'XK', 'Prishtina', 'SRID=4326;POINT(21.1655 42.6629)', 0, false,
   'Prizren', 'XK', 'Prizren', 'SRID=4326;POINT(20.7397 42.2139)', 0, false,
   '[{"key":"box","qty":5,"assembly":false}]', 83.2, 40, '00000000-0000-0000-0000-0000000aa802', '00000000-0000-0000-0000-0000000bb802');
insert into public.quotes (job_id, vehicle_id, mover_company_id, currency, line_items, mover_price, total,
  take_rate_pct, platform_commission, mover_payout, cancel_free_hours, cancel_late_pct, expires_at)
values
  ('00000000-0000-0000-0000-0000000e0801', '00000000-0000-0000-0000-0000000bb801', '00000000-0000-0000-0000-0000000aa801', 'EUR', '[]', 5000, 5000, 20, 1000, 4000, 24, 50, now()),
  ('00000000-0000-0000-0000-0000000e0802', '00000000-0000-0000-0000-0000000bb801', '00000000-0000-0000-0000-0000000aa801', 'EUR', '[]', 5000, 5000, 20, 1000, 4000, 24, 50, now()),
  ('00000000-0000-0000-0000-0000000e0802', '00000000-0000-0000-0000-0000000bb802', '00000000-0000-0000-0000-0000000aa802', 'EUR', '[]', 4500, 4500, 20, 900, 3600, 24, 50, now());

-- The login alone can't go while the company is there (owner_id: on delete restrict) — hence the order.
select throws_ok($$ delete from auth.users where id = '00000000-0000-0000-0000-00000000d801' $$, '23503', null,
  'a mover''s login can''t be deleted before the company');

-- The function's order.
delete from public.jobs where chosen_mover_company_id = '00000000-0000-0000-0000-0000000aa801' and status in ('DRAFT', 'QUOTED');
delete from public.quotes where mover_company_id = '00000000-0000-0000-0000-0000000aa801';
select lives_ok($$ delete from public.mover_companies where id = '00000000-0000-0000-0000-0000000aa801' $$, 'then the company goes');
select lives_ok($$ delete from auth.users where id = '00000000-0000-0000-0000-00000000d801' $$, 'then the login');

select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000d801'), 0, 'no profile');
select is((select count(*)::int from public.vehicles where company_id = '00000000-0000-0000-0000-0000000aa801'), 0, 'no vans');
select is((select count(*)::int from public.rate_cards where vehicle_id = '00000000-0000-0000-0000-0000000bb801'), 0, 'no prices');
select is((select count(*)::int from public.service_areas where company_id = '00000000-0000-0000-0000-0000000aa801'), 0, 'no work areas');
select is((select count(*)::int from public.mover_documents where company_id = '00000000-0000-0000-0000-0000000aa801'), 0, 'no documents');
select is((select count(*)::int from public.mover_reminders where user_id = '00000000-0000-0000-0000-00000000d801'), 0, 'no reminders');
select is((select count(*)::int from public.phone_verifications where user_id = '00000000-0000-0000-0000-00000000d801'), 0, 'no confirmed phones');
select is((select count(*)::int from public.jobs where id = '00000000-0000-0000-0000-0000000e0801'), 0,
  'the request saved with that mover is gone (it can''t be booked any more)');
select is(
  (select count(*)::int from public.quotes where job_id = '00000000-0000-0000-0000-0000000e0802'), 1,
  'another customer''s request stays, with the quote of the mover it moved on to');

-- A customer's own deletion takes their requests and quotes with it.
delete from auth.users where id = '00000000-0000-0000-0000-00000000c802';
select is((select count(*)::int from public.jobs where customer_id = '00000000-0000-0000-0000-00000000c802'), 0,
  'a customer''s login takes their requests and quotes');

select * from finish();
rollback;
