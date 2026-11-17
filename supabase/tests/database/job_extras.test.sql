begin;
select plan(18);

-- Migration 20261117090000: what the customer adds to a move in words — things in no category
-- (items_note) and more people than movers can price yet (helpers_asked). Their form for every writer;
-- read by the customer (their own) and by the chosen mover from the request on; frozen once booked.
-- Fixtures by the platform (service role), as in move_day_contact.test.sql.
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
-- What a statement does, undone afterwards: 'ok', or the SQLSTATE it raised.
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  raise sqlstate 'P0999';
exception when others then
  return case sqlstate when 'P0999' then 'ok' else sqlstate end;
end;
$$;
grant execute on function pg_temp.id(text), pg_temp.as_user(text) to authenticated;

-- What the signed-in mover's list says about a move: "note · asked", or 'not listed'.
create function pg_temp.mover_reads(p_mover text, p_job text) returns text language plpgsql as $$
declare
  seen text;
begin
  perform pg_temp.as_user(p_mover);
  set local role authenticated;
  select coalesce(m.items_note, '-') || ' · ' || coalesce(m.helpers_asked::text, '-') into seen
  from public.my_mover_jobs(true) m where m.job_id = pg_temp.id(p_job);
  reset role;
  perform pg_temp.as_user(null);
  return coalesce(seen, 'not listed');
end;
$$;
-- …and how many of a customer's own moves carry the note, as the signed-in customer reads them.
create function pg_temp.customer_reads(p_customer text, p_job text) returns text language plpgsql as $$
declare
  seen text;
begin
  perform pg_temp.as_user(p_customer);
  set local role authenticated;
  select coalesce(j.items_note, '-') || ' · ' || coalesce(j.helpers_asked::text, '-') into seen from public.jobs j where j.id = pg_temp.id(p_job);
  reset role;
  perform pg_temp.as_user(null);
  return coalesce(seen, 'not readable');
end;
$$;

-- The columns and their form, for every writer.
select has_column('public', 'jobs', 'items_note', 'a move has the things that are in no category, in words…');
select has_column('public', 'jobs', 'helpers_asked', '…and how many people were asked for beyond what is priced');
select pg_temp.saved('day', 'C1', 'A1', 'V1', now() + interval '3 days');
select is(pg_temp.try($$ update public.jobs set items_note = '' where id = pg_temp.id('day') $$), '23514', 'a note is never empty (none is null)');
select is(pg_temp.try($$ update public.jobs set items_note = ' A piano' where id = pg_temp.id('day') $$), '23514', '…kept without spaces around it');
select is(pg_temp.try($$ update public.jobs set items_note = repeat('a', 501) where id = pg_temp.id('day') $$), '23514', '…of at most 500 characters');
select is(pg_temp.try($$ update public.jobs set helpers = 3, helpers_asked = 3 where id = pg_temp.id('day') $$), '23514', 'more people asked for means four or more');
select is(pg_temp.try($$ update public.jobs set helpers = 2, helpers_asked = 5 where id = pg_temp.id('day') $$), '23514', '…and only on a move priced for three');
select is(pg_temp.try($$ update public.jobs set helpers = 3, helpers_asked = 100 where id = pg_temp.id('day') $$), '23514', '…up to 99');
select lives_ok($$ update public.jobs set helpers = 3, helpers_asked = 5, items_note = 'A piano' where id = pg_temp.id('day') $$, 'a request not booked yet takes both');

-- Who reads them: the customer their own; the mover from the request on, like the list of things.
select is(pg_temp.customer_reads('C1', 'day'), 'A piano · 5', 'the customer reads their own');
select is(pg_temp.customer_reads('C2', 'day'), 'not readable', 'another customer reads nothing');
select is(pg_temp.mover_reads('M1', 'day'), 'not listed', 'no mover sees a request that is not booked');
select lives_ok($$ select public.job_book(pg_temp.id('day'), pg_temp.id('C1'), true, '+38344111222', null) $$, 'booked: the request goes to the chosen mover');
select is(pg_temp.mover_reads('M1', 'day'), 'A piano · 5', 'the chosen mover reads both before accepting');
select is(pg_temp.mover_reads('M2', 'day'), 'not listed', 'another mover sees nothing');

-- Booked: they are the move's facts and stay as they are.
select is(pg_temp.try($$ update public.jobs set items_note = 'Two pianos' where id = pg_temp.id('day') $$), '22023', 'a booked move keeps its note');
select is(pg_temp.try($$ update public.jobs set helpers_asked = null where id = pg_temp.id('day') $$), '22023', '…and how many people were asked for');

-- A move without them says nothing.
select pg_temp.saved('declined', 'C1', 'A1', 'V1', now() + interval '4 days');
select public.job_book(pg_temp.id('declined'), pg_temp.id('C1'), true, '+38344111222', null);
select is(pg_temp.mover_reads('M1', 'declined'), '- · -', 'a move without a note or a bigger crew shows none');

select * from finish();
rollback;
