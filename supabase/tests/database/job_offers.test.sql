begin;
select plan(28);

-- Migration 20261017090000 (COMPLIANCE §2, §9.1): booking sends the move to the chosen mover as an
-- offer; the mover sees the area only until they accept, accepts or declines freely; unanswered
-- offers expire; nobody is assigned automatically; the customer cancels before acceptance.
-- Fixtures by the platform (service role); the transitions as the `job-transition` function calls them.
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000c961', '38344000961', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000c962', '38344000962', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d961', '38344000963', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d962', '38344000964', '{"locale":"sq"}');
update public.profiles set role = 'customer' where id in ('00000000-0000-0000-0000-00000000c961', '00000000-0000-0000-0000-00000000c962');
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d961', '00000000-0000-0000-0000-00000000d962');

-- A test mover (bookable without a card until card payments exist) and a real one. The test mover is
-- fully quotable in Prishtina — accepting checks that again (20261017120000).
insert into public.mover_companies (id, owner_id, legal_name, country, is_test, verification_status, stripe_onboarding_complete, cancel_free_hours, cancel_late_pct)
values ('00000000-0000-0000-0000-0000000aa961', '00000000-0000-0000-0000-00000000d961', 'Test Lëvizje', 'XK', true, 'verified', true, 48, 50),
       ('00000000-0000-0000-0000-0000000aa962', '00000000-0000-0000-0000-00000000d962', 'Real Lëvizje', 'XK', false, 'pending', false, null, null);
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, verified_at)
values ('00000000-0000-0000-0000-0000000bb961', '00000000-0000-0000-0000-0000000aa961', 'VAN', 'TEST-XK-961', 2800, 6, now()),
       ('00000000-0000-0000-0000-0000000bb962', '00000000-0000-0000-0000-0000000aa962', 'VAN', 'TEST-XK-962', 2800, 6, null);
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
values ('00000000-0000-0000-0000-0000000bb961', 'EUR', 2500, 60, 28, now());
insert into public.service_areas (company_id, center, radius_km)
values ('00000000-0000-0000-0000-0000000aa961', 'SRID=4326;POINT(21.1655 42.6629)', 90);
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000aa961', 'insurance', 'aa961/insurance.pdf', now() + interval '1 year', now());

-- Three saved requests: two with the test mover (one by another customer), one with the real mover.
insert into public.jobs (id, customer_id, type, vehicle_class, helpers, scheduled_at,
  pickup_area, pickup_district, pickup_country, pickup_label, pickup_street, pickup_point, pickup_details, pickup_floor, pickup_has_lift,
  dropoff_area, dropoff_country, dropoff_label, dropoff_point, dropoff_floor, dropoff_has_lift,
  items, distance_km, est_labor_min, chosen_mover_company_id, chosen_vehicle_id)
select id::uuid, customer::uuid, 'SMALL_MOVE', 'VAN', 2, now() + interval '3 days',
  'Prishtina', 'Dardania', 'XK', 'Rr. Agim Ramadani 12, Prishtina', 'Rr. Agim Ramadani', 'SRID=4326;POINT(21.1655 42.6629)', 'Ring twice', 3, false,
  'Prizren', 'XK', 'Prizren', 'SRID=4326;POINT(20.7397 42.2139)', 0, false,
  '[{"key":"box","qty":5,"assembly":false}]', 83.2, 40, company::uuid, van::uuid
from (values
  ('00000000-0000-0000-0000-0000000e0961', '00000000-0000-0000-0000-00000000c961', '00000000-0000-0000-0000-0000000aa961', '00000000-0000-0000-0000-0000000bb961'),
  ('00000000-0000-0000-0000-0000000e0962', '00000000-0000-0000-0000-00000000c961', '00000000-0000-0000-0000-0000000aa962', '00000000-0000-0000-0000-0000000bb962'),
  ('00000000-0000-0000-0000-0000000e0963', '00000000-0000-0000-0000-00000000c962', '00000000-0000-0000-0000-0000000aa961', '00000000-0000-0000-0000-0000000bb961')
) as f(id, customer, company, van);
insert into public.quotes (job_id, vehicle_id, mover_company_id, currency, line_items, mover_price, total,
  take_rate_pct, platform_commission, mover_payout, cancel_free_hours, cancel_late_pct, expires_at, mover)
select j.id, j.chosen_vehicle_id, j.chosen_mover_company_id, 'EUR', '[{"kind":"base","amount":5000}]', 5000, 5000, 20, 1000, 4000, 48, 50,
  now() + interval '15 minutes', '{"companyId":"x","name":"Mover","isBusiness":true}'
from public.jobs j where j.id in ('00000000-0000-0000-0000-0000000e0961', '00000000-0000-0000-0000-0000000e0962', '00000000-0000-0000-0000-0000000e0963');

create temporary table offered (id uuid) on commit drop;
grant all on offered to authenticated;
create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
$$;

-- When an offer ends: 12 hours, ending 24 hours before the move, at least an hour.
select is(public.offer_expiry('2026-11-01 10:00+00', '2026-11-10 08:00+00'), '2026-11-01 22:00+00'::timestamptz, 'a move days away: 12 hours to answer');
select is(public.offer_expiry('2026-11-01 10:00+00', '2026-11-02 18:00+00'), '2026-11-01 18:00+00'::timestamptz, 'a move tomorrow: the offer ends 24 hours before it');
select is(public.offer_expiry('2026-11-01 10:00+00', '2026-11-01 20:00+00'), '2026-11-01 11:00+00'::timestamptz, 'a move later today: at least an hour');

-- Booking.
select throws_ok($$ select public.job_book('00000000-0000-0000-0000-0000000e0962', '00000000-0000-0000-0000-00000000c961', true) $$,
  '22023', 'card_required', 'a real mover is booked only with a card (Stripe), never as a test');
select throws_ok($$ select public.job_book('00000000-0000-0000-0000-0000000e0961', '00000000-0000-0000-0000-00000000c961', false) $$,
  '22023', 'card_required', 'no card payments yet: no booking without the test path');
select throws_ok($$ select public.job_book('00000000-0000-0000-0000-0000000e0961', '00000000-0000-0000-0000-00000000c962', true) $$,
  'P0002', 'not_found', 'nobody books someone else''s request');
insert into offered select public.job_book('00000000-0000-0000-0000-0000000e0961', '00000000-0000-0000-0000-00000000c961', true);
select is((select status::text from public.jobs where id = '00000000-0000-0000-0000-0000000e0961'), 'OFFERED', 'booked: sent to the chosen mover');
select is((select string_agg(event || '>' || status, ',' order by id) from public.job_events where job_id = '00000000-0000-0000-0000-0000000e0961'),
  'booked>BOOKED,offered>OFFERED', 'each step is in the move''s log');
select is((select mover_company_id::text || ':' || status from public.job_offers where id = (select id from offered)),
  '00000000-0000-0000-0000-0000000aa961:offered', 'the offer goes to the mover the customer chose — nobody else');
select throws_ok($$ select public.job_book('00000000-0000-0000-0000-0000000e0961', '00000000-0000-0000-0000-00000000c961', true) $$,
  '22023', 'not_bookable', 'booked once');

-- What the mover sees before accepting: the area, never the exact place (COMPLIANCE §9.1).
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d961');
select is((select pickup_area || '/' || pickup_district || ':' || coalesce(pickup_label, '-') || ':' || coalesce(pickup_details, '-') || ':' || coalesce(pickup_lat::text, '-')
  from public.my_mover_jobs() where job_id = '00000000-0000-0000-0000-0000000e0961'),
  'Prishtina/Dardania:-:-:-', 'before accepting: the town and neighbourhood only');
select is((select mover_price || ':' || platform_commission || ':' || mover_payout from public.my_mover_jobs() where job_id = '00000000-0000-0000-0000-0000000e0961'),
  '5000:1000:4000', '…with their own price, the commission and their payout');
select is((select count(*)::int from public.jobs), 0, 'the move itself stays private to the customer');
select is((select count(*)::int from public.job_events), 2, 'the mover reads the steps of a move offered to them');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d962');
select is((select count(*)::int from public.my_mover_jobs()), 0, 'another mover sees nothing of it');
select is((select count(*)::int from public.job_offers), 0, '…not even the offer');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c961');
select is((select status::text || ':' || (expires_at > now()) from public.job_offers), 'offered:true', 'the customer reads the offer and when it ends');
reset role;

-- Answering: only the company's owner; accepted, the exact place.
select throws_ok(format($$ select public.job_answer_offer(%L, '00000000-0000-0000-0000-00000000d962', true) $$, (select id from offered)),
  'P0002', 'not_found', 'only the mover it was offered to answers');
select is(public.job_answer_offer((select id from offered), '00000000-0000-0000-0000-00000000d961', true), 'ACCEPTED'::public.job_status, 'the mover accepts');
select throws_ok(format($$ select public.job_answer_offer(%L, '00000000-0000-0000-0000-00000000d961', false) $$, (select id from offered)),
  '22023', 'already_answered', 'an answer is final');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d961');
select is((select pickup_label || ' · ' || pickup_details || ' · ' || round(pickup_lat::numeric, 4) from public.my_mover_jobs() where job_id = '00000000-0000-0000-0000-0000000e0961'),
  'Rr. Agim Ramadani 12, Prishtina · Ring twice · 42.6629', 'accepted: the exact place and the customer''s directions');
reset role;
select throws_ok($$ select public.job_cancel('00000000-0000-0000-0000-0000000e0961', '00000000-0000-0000-0000-00000000c961') $$,
  '22023', 'not_cancellable', 'once accepted, the mover''s cancellation terms apply (next step)');

-- Declining: back to the customer, nobody else assigned.
delete from offered;
insert into offered select public.job_book('00000000-0000-0000-0000-0000000e0963', '00000000-0000-0000-0000-00000000c962', true);
select is(public.job_answer_offer((select id from offered), '00000000-0000-0000-0000-00000000d961', false), 'QUOTED'::public.job_status,
  'declined: the move goes back to the customer to choose another mover');
select is((select count(*)::int from public.job_offers where job_id = '00000000-0000-0000-0000-0000000e0963' and status = 'offered'), 0,
  '…and is offered to nobody else automatically');

-- Expiring: rebooked, not answered in time.
update public.quotes set expires_at = now() + interval '15 minutes' where job_id = '00000000-0000-0000-0000-0000000e0963';
delete from offered;
insert into offered select public.job_book('00000000-0000-0000-0000-0000000e0963', '00000000-0000-0000-0000-00000000c962', true);
select ok(public.expire_job_offers(now() + interval '13 hours') >= 1, 'an offer nobody answered in time ends');
select is((select o.status::text || ':' || j.status from public.job_offers o join public.jobs j on j.id = o.job_id where o.id = (select id from offered)),
  'expired:QUOTED', '…and the move goes back to the customer');

-- Cancelling before acceptance.
select lives_ok($$ select public.job_cancel('00000000-0000-0000-0000-0000000e0963', '00000000-0000-0000-0000-00000000c962') $$, 'the customer cancels before a mover accepts');
select is((select cron.job.schedule from cron.job where jobname = 'expire-job-offers'), '*/5 * * * *', 'offers are checked every 5 minutes (pg_cron)');

select * from finish();
rollback;
