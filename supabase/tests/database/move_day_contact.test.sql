begin;
select plan(38);

-- Migration 20261019090000 (design/DECISIONS.md #37; COMPLIANCE §9, §9.1): the customer's phone for the
-- move day. Given when booking (required; who to ask for, optional), changeable by the customer until the
-- mover is on the way, then kept as it is; seen only by the mover who accepted the move, from acceptance
-- until the move is done or cancelled. Fixtures by the platform (service role); the steps as the
-- `job-transition` function calls them; the lists as the signed-in mover reads them.
-- Whatever terms the project published are set aside (all of this is rolled back).
delete from public.terms_acceptances;
delete from public.terms_notices;
delete from public.terms_versions;

insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000c991', '38344000991', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000c992', '38344000992', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d991', '38344000993', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d992', '38344000994', '{"locale":"sq"}');
update public.profiles set role = 'customer' where id in ('00000000-0000-0000-0000-00000000c991', '00000000-0000-0000-0000-00000000c992');
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d991', '00000000-0000-0000-0000-00000000d992');

-- A fully quotable test mover in Prishtina (bookable without a card until card payments exist), and another mover.
insert into public.mover_companies (id, owner_id, legal_name, country, is_test, verification_status, stripe_onboarding_complete, cancel_free_hours, cancel_late_pct)
values ('00000000-0000-0000-0000-0000000aa991', '00000000-0000-0000-0000-00000000d991', 'Test Lëvizje Tre', 'XK', true, 'verified', true, 48, 50),
       ('00000000-0000-0000-0000-0000000aa992', '00000000-0000-0000-0000-00000000d992', 'Test Lëvizje Katër', 'XK', true, 'verified', true, 48, 50);
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, verified_at)
values ('00000000-0000-0000-0000-0000000bb991', '00000000-0000-0000-0000-0000000aa991', 'VAN', 'TEST-XK-991', 2800, 6, now()),
       ('00000000-0000-0000-0000-0000000bb992', '00000000-0000-0000-0000-0000000aa992', 'VAN', 'TEST-XK-992', 2800, 6, now());
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
values ('00000000-0000-0000-0000-0000000bb991', 'EUR', 2500, 60, 28, now()),
       ('00000000-0000-0000-0000-0000000bb992', 'EUR', 2500, 60, 28, now());
insert into public.service_areas (company_id, center, radius_km)
values ('00000000-0000-0000-0000-0000000aa991', 'SRID=4326;POINT(21.1655 42.6629)', 90),
       ('00000000-0000-0000-0000-0000000aa992', 'SRID=4326;POINT(21.1655 42.6629)', 90);
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000aa991', 'insurance', 'aa991/insurance.pdf', now() + interval '1 year', now()),
       ('00000000-0000-0000-0000-0000000aa992', 'insurance', 'aa992/insurance.pdf', now() + interval '1 year', now());

-- Names for the ids: customers C1, C2; movers M1, M2 with companies A1, A2 (one van each); one move per case.
create temporary table ids (name text primary key, id uuid not null) on commit drop;
grant select on ids to authenticated, anon;
insert into ids values
  ('C1', '00000000-0000-0000-0000-00000000c991'), ('C2', '00000000-0000-0000-0000-00000000c992'),
  ('M1', '00000000-0000-0000-0000-00000000d991'), ('M2', '00000000-0000-0000-0000-00000000d992'),
  ('A1', '00000000-0000-0000-0000-0000000aa991'), ('A2', '00000000-0000-0000-0000-0000000aa992'),
  ('V1', '00000000-0000-0000-0000-0000000bb991'), ('V2', '00000000-0000-0000-0000-0000000bb992'),
  ('day',       '00000000-0000-0000-0000-0000000e9901'),  -- booked, changed, accepted, on the way
  ('cancelled', '00000000-0000-0000-0000-0000000e9902'),  -- the customer cancels after acceptance
  ('mover_off', '00000000-0000-0000-0000-0000000e9903'),  -- the mover cancels
  ('declined',  '00000000-0000-0000-0000-0000000e9904');  -- declined, then booked again
create temporary table notes (k text primary key, v text) on commit drop;
grant all on notes to authenticated;

create function pg_temp.id(p_name text) returns uuid language sql stable as $$
  select i.id from ids i where i.name = p_name
$$;
create function pg_temp.as_user(p_name text) returns text language sql as $$
  select set_config('request.jwt.claims',
    case when p_name is null then '' else json_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text end, true)
$$;
-- A saved request as `book` writes it (the mover's price 50.00 EUR; free cancellation until 48 hours before).
create function pg_temp.saved(p_job text, p_customer text, p_company text, p_van text, p_at timestamptz) returns uuid language sql as $$
  insert into public.jobs (id, customer_id, type, vehicle_class, helpers, scheduled_at,
    pickup_area, pickup_district, pickup_country, pickup_label, pickup_street, pickup_house_number, pickup_point, pickup_details, pickup_floor, pickup_has_lift,
    dropoff_area, dropoff_district, dropoff_country, dropoff_label, dropoff_street, dropoff_house_number, dropoff_point, dropoff_details, dropoff_floor, dropoff_has_lift,
    items, distance_km, est_labor_min, chosen_mover_company_id, chosen_vehicle_id)
  values (pg_temp.id(p_job), pg_temp.id(p_customer), 'SMALL_MOVE', 'VAN', 2, p_at,
    'Prishtina', 'Dardania', 'XK', 'Rr. Agim Ramadani 12, Prishtina', 'Rr. Agim Ramadani', '12', 'SRID=4326;POINT(21.1655 42.6629)', 'Ring twice', 3, false,
    'Prizren', 'Bazhdarhane', 'XK', 'Rr. Remzi Ademaj 3, Prizren', 'Rr. Remzi Ademaj', '3', 'SRID=4326;POINT(20.7397 42.2139)', 'Blue gate', 0, false,
    '[{"key":"box","qty":5,"assembly":false}]', 83.2, 40, pg_temp.id(p_company), pg_temp.id(p_van));
  insert into public.quotes (job_id, vehicle_id, mover_company_id, currency, line_items, mover_price, total,
    take_rate_pct, platform_commission, mover_payout, cancel_free_hours, cancel_late_pct, expires_at)
  values (pg_temp.id(p_job), pg_temp.id(p_van), pg_temp.id(p_company), 'EUR', '[{"kind":"base","amount":5000}]', 5000, 5000,
    20, 1000, 4000, 48, 50, now() + interval '15 minutes');
  select pg_temp.id(p_job);
$$;
-- Booked with a phone and accepted by the company's owner.
create function pg_temp.accepted(p_job text, p_at timestamptz) returns void language plpgsql as $$
begin
  perform pg_temp.saved(p_job, 'C1', 'A1', 'V1', p_at);
  perform public.job_answer_offer(public.job_book(pg_temp.id(p_job), pg_temp.id('C1'), true, '+38344111222', 'Arben'), pg_temp.id('M1'), true);
end;
$$;
create function pg_temp.set_contact(p_job text, p_customer text, p_phone text, p_name text) returns void language sql as $$
  select public.job_set_contact(pg_temp.id(p_job), pg_temp.id(p_customer), p_phone, p_name)
$$;
-- What a statement does, undone afterwards: 'ok', or the SQLSTATE it raised.
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  raise sqlstate 'P0999';
exception when others then
  return case sqlstate when 'P0999' then 'ok' else sqlstate end;
end;
$$;
-- The move's phone for the move day as Postgres keeps it: "phone · name".
create function pg_temp.contact(p_job text) returns text language sql stable as $$
  select coalesce(contact_phone, '-') || ' · ' || coalesce(contact_name, '-') from public.jobs where id = pg_temp.id(p_job)
$$;
-- …and as the signed-in mover's list shows it: "status: phone · name", or 'not listed'.
create function pg_temp.mover_sees(p_mover text, p_job text) returns text language plpgsql as $$
declare
  seen text;
begin
  perform pg_temp.as_user(p_mover);
  set local role authenticated;
  select m.status || ': ' || coalesce(m.contact_phone, '-') || ' · ' || coalesce(m.contact_name, '-') into seen
  from public.my_mover_jobs(true) m where m.job_id = pg_temp.id(p_job);
  reset role;
  perform pg_temp.as_user(null);
  return coalesce(seen, 'not listed');
end;
$$;
grant execute on function pg_temp.id(text), pg_temp.as_user(text) to authenticated;

-- The columns and their form, for every writer.
select has_column('public', 'jobs', 'contact_phone', 'a move has a phone for the move day…');
select has_column('public', 'jobs', 'contact_name', '…and who to ask for');
select pg_temp.saved('day', 'C1', 'A1', 'V1', now() + interval '3 days');
select is(pg_temp.try($$ update public.jobs set contact_phone = '044 111 222' where id = pg_temp.id('day') $$), '23514',
  'a phone is kept with its country code (+…), as one number');
select is(pg_temp.try($$ update public.jobs set contact_phone = '+38344111222', contact_name = ' Arben' where id = pg_temp.id('day') $$), '23514',
  'a name is kept without spaces around it');
select is(pg_temp.try($$ update public.jobs set contact_phone = '+38344111222', contact_name = repeat('a', 61) where id = pg_temp.id('day') $$), '23514',
  '…of at most 60 characters');
select is(pg_temp.try($$ update public.jobs set contact_name = 'Arben' where id = pg_temp.id('day') $$), '23514',
  '…and only with a phone');

-- Booking: the phone is required, checked last.
select throws_ok($$ select public.job_book(pg_temp.id('day'), pg_temp.id('C1'), true) $$, '22023', 'contact_required',
  'no booking without a phone for the move day');
select throws_ok($$ select public.job_book(pg_temp.id('day'), pg_temp.id('C1'), false) $$, '22023', 'card_required',
  'whatever else is wrong with the booking is said first');
select throws_ok($$ select public.job_book(pg_temp.id('day'), pg_temp.id('C1'), true, '+0441', null) $$, '22023', 'invalid_contact',
  'a phone without a country code is refused');
select throws_ok($$ select public.job_book(pg_temp.id('day'), pg_temp.id('C1'), true, '+38344111222', repeat('a', 61)) $$, '22023', 'invalid_contact',
  '…and a name over 60 characters');
select is(pg_temp.contact('day'), '- · -', 'a refused booking saves nothing');
insert into notes select 'day offer', public.job_book(pg_temp.id('day'), pg_temp.id('C1'), true, '+38344111222', '  ');
select is((select status::text from public.jobs where id = pg_temp.id('day')) || ' ' || pg_temp.contact('day'), 'OFFERED +38344111222 · -',
  'booked with a phone (an empty name is none)');
select is(pg_temp.mover_sees('M1', 'day'), 'OFFERED: - · -', 'the mover doesn''t see the phone of a request they haven''t accepted (COMPLIANCE §9)');

-- Changing it while booked and before the mover is on the way.
select lives_ok($$ select pg_temp.set_contact('day', 'C1', '+38349555666', ' Drita ') $$, 'the customer changes it while the request is open…');
select is(pg_temp.contact('day'), '+38349555666 · Drita', '…kept as given (the name trimmed)');
select throws_ok($$ select pg_temp.set_contact('day', 'C2', '+38344000000', null) $$, 'P0002', 'not_found', 'nobody else changes it');
select throws_ok($$ select pg_temp.set_contact('day', 'C1', '0449555666', null) $$, '22023', 'invalid_contact', 'a phone without a country code is refused');
select is(pg_temp.contact('day'), '+38349555666 · Drita', '…and changes nothing');
select is(public.job_answer_offer((select v::uuid from notes where k = 'day offer'), pg_temp.id('M1'), true), 'ACCEPTED'::public.job_status, 'the mover accepts');
select is(pg_temp.mover_sees('M1', 'day'), 'ACCEPTED: +38349555666 · Drita', 'the accepted mover sees the phone and who to ask for');
select is(pg_temp.mover_sees('M2', 'day'), 'not listed', 'another mover sees nothing of the move');
select lives_ok($$ select pg_temp.set_contact('day', 'C1', '+38349777888', null) $$, 'the customer changes it after acceptance, before the move day starts…');
select is(pg_temp.mover_sees('M1', 'day'), 'ACCEPTED: +38349777888 · -', '…and the mover sees the new one (no name now)');
select is(pg_temp.try($$ update public.jobs set pickup_details = 'Ring once' where id = pg_temp.id('day') $$), '22023',
  'the rest of a booked move stays frozen');

-- On the way: kept as it is.
alter table public.jobs disable trigger jobs_keep_booked_facts;
update public.jobs set scheduled_at = now() + interval '2 hours' where id = pg_temp.id('day');
alter table public.jobs enable trigger jobs_keep_booked_facts;
select is(public.job_step(pg_temp.id('day'), pg_temp.id('M1'), 'EN_ROUTE_TO_PICKUP')::text, 'EN_ROUTE_TO_PICKUP', 'the mover is on the way');
select throws_ok($$ select pg_temp.set_contact('day', 'C1', '+38344000001', null) $$, '22023', 'contact_locked',
  'from "On my way" on, the customer can''t change the phone');
select throws_ok($$ update public.jobs set contact_phone = '+38344000001' where id = pg_temp.id('day') $$, '22023', 'contact_locked',
  '…nor can any other writer');
select is(pg_temp.mover_sees('M1', 'day'), 'EN_ROUTE_TO_PICKUP: +38349777888 · -', 'the mover still sees it during the move');

-- Ended: hidden from the mover, kept for the customer.
select pg_temp.accepted('cancelled', now() + interval '5 days');
select is(public.job_cancel(pg_temp.id('cancelled'), pg_temp.id('C1'), 0), 0, 'the customer cancels in the free time');
select is(pg_temp.mover_sees('M1', 'cancelled'), 'CANCELLED: - · -', 'once cancelled, the mover no longer sees the phone');
select throws_ok($$ select pg_temp.set_contact('cancelled', 'C1', '+38344000002', null) $$, '22023', 'contact_locked', '…and it can''t change');
select pg_temp.accepted('mover_off', now() + interval '5 days');
select is(public.job_mover_cancel(pg_temp.id('mover_off'), pg_temp.id('M1'), null)::text, 'CANCELLED', 'the mover cancels');
select is(pg_temp.mover_sees('M1', 'mover_off'), 'CANCELLED: - · -', '…and no longer sees the phone either');

-- Declined, then booked again: the phone given earlier stays unless a new one is given.
select pg_temp.saved('declined', 'C1', 'A1', 'V1', now() + interval '4 days');
select is(public.job_answer_offer(public.job_book(pg_temp.id('declined'), pg_temp.id('C1'), true, '+38344111222', 'Arben'), pg_temp.id('M1'), false),
  'QUOTED'::public.job_status, 'a booked move the mover declines is a request again');
select lives_ok($$ select public.job_book(pg_temp.id('declined'), pg_temp.id('C1'), true) $$, 'booked again without a new phone…');
select is(pg_temp.contact('declined'), '+38344111222 · Arben', '…keeps the one given before');

-- Who may do what.
select ok(
  not has_function_privilege('authenticated', 'public.job_set_contact(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.job_set_contact(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.job_book(uuid, uuid, boolean, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.move_day_contact_valid(text, text)', 'execute')
  and has_function_privilege('service_role', 'public.job_set_contact(uuid, uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.job_book(uuid, uuid, boolean, text, text)', 'execute'),
  'booking and changing the phone run only for the server (job-transition), never for a signed-in user');
select ok(to_regprocedure('public.job_book(uuid, uuid, boolean)') is null, 'the old booking signature is replaced (a call without a phone finds the new one)');

select * from finish();
rollback;
