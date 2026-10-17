begin;
select plan(22);

-- Migration 20261017120000 (COMPLIANCE §5, §6, §11, §13): accepting re-checks the mover for the move
-- day with the rules of quoting; declining never does; clearer refusals; a booked move is frozen.
-- Whatever terms the project published are set aside (all of this is rolled back).
delete from public.terms_acceptances;
delete from public.terms_notices;
delete from public.terms_versions;

insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000c971', '38344000971', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d971', '38344000972', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d973', '38344000973', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000a971', '38344000974', '{"locale":"en"}');
update public.profiles set role = 'customer' where id = '00000000-0000-0000-0000-00000000c971';
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d971', '00000000-0000-0000-0000-00000000d973');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a971';

-- A fully quotable test mover in Prishtina (a 2.8 t van, and a 2.4 t van for moves across a border),
-- and a fully quotable real mover (needs the current terms).
insert into public.mover_companies (id, owner_id, legal_name, country, is_test, verification_status, stripe_onboarding_complete, cancel_free_hours, cancel_late_pct)
values ('00000000-0000-0000-0000-0000000aa971', '00000000-0000-0000-0000-00000000d971', 'Test Lëvizje', 'XK', true, 'verified', true, 48, 50),
       ('00000000-0000-0000-0000-0000000aa973', '00000000-0000-0000-0000-00000000d973', 'Real Lëvizje', 'XK', false, 'verified', true, 48, 50);
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, verified_at)
values ('00000000-0000-0000-0000-0000000bb971', '00000000-0000-0000-0000-0000000aa971', 'VAN', 'TEST-XK-971', 2800, 6, now()),
       ('00000000-0000-0000-0000-0000000bb972', '00000000-0000-0000-0000-0000000aa971', 'VAN', 'TEST-XK-972', 2400, 6, now()),
       ('00000000-0000-0000-0000-0000000bb973', '00000000-0000-0000-0000-0000000aa973', 'VAN', 'TEST-XK-973', 2800, 6, now());
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
select v, 'EUR', 2500, 60, 28, now()
from unnest(array['00000000-0000-0000-0000-0000000bb971', '00000000-0000-0000-0000-0000000bb972', '00000000-0000-0000-0000-0000000bb973']::uuid[]) v;
insert into public.service_areas (company_id, center, radius_km)
values ('00000000-0000-0000-0000-0000000aa971', 'SRID=4326;POINT(21.1655 42.6629)', 90),
       ('00000000-0000-0000-0000-0000000aa973', 'SRID=4326;POINT(21.1655 42.6629)', 90);
insert into public.mover_documents (id, company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000dd971', '00000000-0000-0000-0000-0000000aa971', 'insurance', 'aa971/insurance.pdf', now() + interval '1 year', now()),
       ('00000000-0000-0000-0000-0000000dd973', '00000000-0000-0000-0000-0000000aa973', 'insurance', 'aa973/insurance.pdf', now() + interval '1 year', now());

-- A saved request with its quote (as `book` writes them): within Kosovo, or to Albania.
create function pg_temp.saved(id uuid, company uuid, van uuid, dropoff_country text) returns uuid language sql as $$
  insert into public.jobs (id, customer_id, type, vehicle_class, helpers, scheduled_at,
    pickup_area, pickup_country, pickup_label, pickup_point, pickup_floor, pickup_has_lift,
    dropoff_area, dropoff_country, dropoff_label, dropoff_point, dropoff_floor, dropoff_has_lift,
    items, distance_km, est_labor_min, chosen_mover_company_id, chosen_vehicle_id)
  values (id, '00000000-0000-0000-0000-00000000c971', 'SMALL_MOVE', 'VAN', 2, now() + interval '3 days',
    'Prishtina', 'XK', 'Prishtina', 'SRID=4326;POINT(21.1655 42.6629)', 0, false,
    case dropoff_country when 'AL' then 'Tirana' else 'Prizren' end, dropoff_country, 'Elsewhere', 'SRID=4326;POINT(20.7397 42.2139)', 0, false,
    '[{"key":"box","qty":5,"assembly":false}]', 83.2, 40, company, van);
  insert into public.quotes (job_id, vehicle_id, mover_company_id, currency, line_items, mover_price, total,
    take_rate_pct, platform_commission, mover_payout, cancel_free_hours, cancel_late_pct, expires_at)
  values (id, van, company, 'EUR', '[{"kind":"base","amount":5000}]', 5000, 5000, 20, 1000, 4000, 48, 50, now() + interval '15 minutes');
  select id;
$$;
create temporary table offered (n int, id uuid) on commit drop;

insert into offered select 0, pg_temp.saved('00000000-0000-0000-0000-0000000e0971', '00000000-0000-0000-0000-0000000aa971', '00000000-0000-0000-0000-0000000bb971', 'XK');
insert into offered select 1, public.job_book('00000000-0000-0000-0000-0000000e0971', '00000000-0000-0000-0000-00000000c971', true);
create function pg_temp.accept(n int) returns public.job_status language sql as $$
  select public.job_answer_offer((select id from offered where offered.n = accept.n), '00000000-0000-0000-0000-00000000d971', true)
$$;

-- Each condition of the move day, broken in turn: accepting is refused and the offer stays open.
update public.mover_documents set verified_at = null where id = '00000000-0000-0000-0000-0000000dd971';
select throws_ok($$ select pg_temp.accept(1) $$, '22023', 'not_eligible', 'insurance nobody checked: not accepted (COMPLIANCE §5)');
update public.mover_documents set verified_at = now(), expires_at = now() + interval '2 days' where id = '00000000-0000-0000-0000-0000000dd971';
select throws_ok($$ select pg_temp.accept(1) $$, '22023', 'not_eligible', 'insurance that ends before the move day: not accepted');
update public.mover_documents set expires_at = now() + interval '1 year' where id = '00000000-0000-0000-0000-0000000dd971';

insert into public.suspensions (id, company_id, kind, flagged_by, reason_text, reviewed_by, notice_sent_at, effective_at)
values ('00000000-0000-0000-0000-0000000ff971', '00000000-0000-0000-0000-0000000aa971', 'suspension', 'admin', 'Repeated no-shows at pickups.',
  '00000000-0000-0000-0000-00000000a971', now(), now());
select throws_ok($$ select pg_temp.accept(1) $$, '22023', 'not_eligible', 'a suspended mover: not accepted (COMPLIANCE §3)');
delete from public.suspensions where id = '00000000-0000-0000-0000-0000000ff971';

update public.mover_companies set verification_status = 'pending' where id = '00000000-0000-0000-0000-0000000aa971';
select throws_ok($$ select pg_temp.accept(1) $$, '22023', 'not_eligible', 'a company whose check is pending: not accepted');
update public.mover_companies set verification_status = 'verified', stripe_onboarding_complete = false where id = '00000000-0000-0000-0000-0000000aa971';
select throws_ok($$ select pg_temp.accept(1) $$, '22023', 'not_eligible', 'payouts not set up: not accepted (COMPLIANCE §6)');
update public.mover_companies set stripe_onboarding_complete = true where id = '00000000-0000-0000-0000-0000000aa971';

update public.vehicles set active = false where id = '00000000-0000-0000-0000-0000000bb971';
select throws_ok($$ select pg_temp.accept(1) $$, '22023', 'not_eligible', 'a van taken out of use: not accepted');
update public.vehicles set active = true, verified_at = null where id = '00000000-0000-0000-0000-0000000bb971';
select throws_ok($$ select pg_temp.accept(1) $$, '22023', 'not_eligible', 'a van nobody checked: not accepted');
update public.vehicles set verified_at = now() where id = '00000000-0000-0000-0000-0000000bb971';

select is((select status::text from public.job_offers where id = (select id from offered where n = 1)), 'offered', 'refused, the request stays open');
select is(pg_temp.accept(1), 'ACCEPTED'::public.job_status, 'everything in order again: accepted');

-- Across a border: CMR insurance valid on the move day (COMPLIANCE §11).
insert into offered select 0, pg_temp.saved('00000000-0000-0000-0000-0000000e0972', '00000000-0000-0000-0000-0000000aa971', '00000000-0000-0000-0000-0000000bb972', 'AL');
insert into offered select 2, public.job_book('00000000-0000-0000-0000-0000000e0972', '00000000-0000-0000-0000-00000000c971', true);
select throws_ok($$ select pg_temp.accept(2) $$, '22023', 'not_eligible', 'across a border without CMR insurance: not accepted');
insert into public.mover_documents (id, company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000dd972', '00000000-0000-0000-0000-0000000aa971', 'cmr', 'aa971/cmr.pdf', now() + interval '1 day', now());
select throws_ok($$ select pg_temp.accept(2) $$, '22023', 'not_eligible', 'CMR insurance that ends before the move day: not accepted');
update public.mover_documents set expires_at = now() + interval '1 year' where id = '00000000-0000-0000-0000-0000000dd972';
select is(pg_temp.accept(2), 'ACCEPTED'::public.job_status, 'with CMR valid on the move day (a van up to 2.5 t): accepted');

-- A real mover needs the terms for movers in effect (test movers are the platform's own). Booked
-- with a card once that exists — the offer is made here by the platform.
insert into offered select 0, pg_temp.saved('00000000-0000-0000-0000-0000000e0973', '00000000-0000-0000-0000-0000000aa973', '00000000-0000-0000-0000-0000000bb973', 'XK');
update public.jobs set status = 'BOOKED' where id = '00000000-0000-0000-0000-0000000e0973';
update public.jobs set status = 'OFFERED' where id = '00000000-0000-0000-0000-0000000e0973';
with o as (
  insert into public.job_offers (job_id, quote_id, mover_company_id, expires_at)
  select '00000000-0000-0000-0000-0000000e0973', q.id, q.mover_company_id, now() + interval '12 hours'
  from public.quotes q where q.job_id = '00000000-0000-0000-0000-0000000e0973'
  returning id
)
insert into offered select 3, id from o;
insert into public.terms_versions (audience, version, document_path, content, content_sha256, effective_at)
values ('mover', 1, '/legal/mover-terms', '{"text": {}}', 'x', now());
select throws_ok(format($$ select public.job_answer_offer(%L, '00000000-0000-0000-0000-00000000d973', true) $$, (select id from offered where n = 3)),
  '22023', 'not_eligible', 'a real mover who hasn''t accepted the terms in effect: not accepted');
insert into public.terms_acceptances (user_id, terms_version_id)
select '00000000-0000-0000-0000-00000000d973', id from public.terms_versions where audience = 'mover';
select is(public.job_answer_offer((select id from offered where n = 3), '00000000-0000-0000-0000-00000000d973', true), 'ACCEPTED'::public.job_status,
  'terms accepted: accepted');

-- Declining never checks anything (COMPLIANCE §2).
insert into offered select 0, pg_temp.saved('00000000-0000-0000-0000-0000000e0974', '00000000-0000-0000-0000-0000000aa971', '00000000-0000-0000-0000-0000000bb971', 'XK');
insert into offered select 4, public.job_book('00000000-0000-0000-0000-0000000e0974', '00000000-0000-0000-0000-00000000c971', true);
update public.mover_documents set verified_at = null where id = '00000000-0000-0000-0000-0000000dd971';
select is(public.job_answer_offer((select id from offered where n = 4), '00000000-0000-0000-0000-00000000d971', false), 'QUOTED'::public.job_status,
  'declining is free: no check');
update public.mover_documents set verified_at = now() where id = '00000000-0000-0000-0000-0000000dd971';

-- Clearer refusals: cancelled by the customer, or expired.
update public.quotes set expires_at = now() + interval '15 minutes' where job_id = '00000000-0000-0000-0000-0000000e0974';
insert into offered select 5, public.job_book('00000000-0000-0000-0000-0000000e0974', '00000000-0000-0000-0000-00000000c971', true);
do $$ begin perform public.job_cancel('00000000-0000-0000-0000-0000000e0974', '00000000-0000-0000-0000-00000000c971'); end $$;
select throws_ok($$ select pg_temp.accept(5) $$, '22023', 'not_open', 'a request the customer cancelled: not_open');
insert into offered select 0, pg_temp.saved('00000000-0000-0000-0000-0000000e0975', '00000000-0000-0000-0000-0000000aa971', '00000000-0000-0000-0000-0000000bb971', 'XK');
insert into offered select 6, public.job_book('00000000-0000-0000-0000-0000000e0975', '00000000-0000-0000-0000-00000000c971', true);
do $$ begin perform public.expire_job_offers(now() + interval '13 hours'); end $$;
select throws_ok($$ select pg_temp.accept(6) $$, '22023', 'offer_expired', 'a request that ended: offer_expired');

-- A booked move is frozen: its facts, and its price.
select throws_ok($$ update public.jobs set scheduled_at = now() + interval '5 days' where id = '00000000-0000-0000-0000-0000000e0971' $$,
  '22023', 'job_frozen', 'a booked move keeps its day');
select throws_ok($$ update public.jobs set items = '[{"key":"box","qty":50,"assembly":false}]' where id = '00000000-0000-0000-0000-0000000e0971' $$,
  '22023', 'job_frozen', '…and its things');
select throws_ok(
  $$ insert into public.quotes (job_id, vehicle_id, mover_company_id, currency, line_items, mover_price, total,
       take_rate_pct, platform_commission, mover_payout, cancel_free_hours, cancel_late_pct, expires_at)
     values ('00000000-0000-0000-0000-0000000e0971', '00000000-0000-0000-0000-0000000bb971', '00000000-0000-0000-0000-0000000aa971', 'EUR',
       '[]', 1, 1, 20, 0, 1, 48, 50, now() + interval '15 minutes') $$,
  '22023', 'job_not_open', '…and the price it was booked at');

-- Booking needs the price of the move as it is now: a quote older than the request's last change is refused.
insert into offered select 0, pg_temp.saved('00000000-0000-0000-0000-0000000e0976', '00000000-0000-0000-0000-0000000aa971', '00000000-0000-0000-0000-0000000bb971', 'XK');
update public.quotes set created_at = now() - interval '1 minute' where job_id = '00000000-0000-0000-0000-0000000e0976';
select throws_ok($$ select public.job_book('00000000-0000-0000-0000-0000000e0976', '00000000-0000-0000-0000-00000000c971', true) $$,
  '22023', 'quote_required', 'a request changed after its price: priced again before booking');
select lives_ok($$ update public.jobs set items = '[{"key":"box","qty":6,"assembly":false}]' where id = '00000000-0000-0000-0000-0000000e0976' $$,
  'a saved request still changes freely');

select * from finish();
rollback;
