begin;
select plan(230);

-- Migration 20261017130000 (design/DECISIONS.md #36; COMPLIANCE §2, §3, §7, §8, §9, §9.1, §13): the job
-- day. The mover whose offer was accepted marks the steps one at a time (on my way from 6 hours before
-- the arrival time, a photo before leaving each stop); photos are evidence the mover's app adds at the
-- stop; until the things are loaded the customer cancels under the mover's terms (the fee shown first,
-- only recorded) and the mover cancels for free — either way the move is cancelled for good; the
-- customer confirms the move is done; the mover sees the exact place only while it is needed. Nothing
-- of it is ever counted against a mover. Fixtures by the platform (service role); the transitions as
-- the `job-transition` function calls them; photos as the mover's app adds them (signed in, RLS).
-- now() is the same all through the test: times are moved with the helpers below.
-- Whatever terms the project published are set aside (all of this is rolled back).
delete from public.terms_acceptances;
delete from public.terms_notices;
delete from public.terms_versions;

insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000c981', '38344000981', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000c982', '38344000982', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d981', '38344000983', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d982', '38344000984', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000a981', '38344000985', '{"locale":"en"}');
update public.profiles set role = 'customer' where id in ('00000000-0000-0000-0000-00000000c981', '00000000-0000-0000-0000-00000000c982');
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d981', '00000000-0000-0000-0000-00000000d982');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a981';

-- Two fully quotable test movers in Prishtina (bookable without a card until card payments exist).
insert into public.mover_companies (id, owner_id, legal_name, country, is_test, verification_status, stripe_onboarding_complete, cancel_free_hours, cancel_late_pct)
values ('00000000-0000-0000-0000-0000000aa981', '00000000-0000-0000-0000-00000000d981', 'Test Lëvizje Një', 'XK', true, 'verified', true, 48, 50),
       ('00000000-0000-0000-0000-0000000aa982', '00000000-0000-0000-0000-00000000d982', 'Test Lëvizje Dy', 'XK', true, 'verified', true, 48, 50);
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, verified_at)
values ('00000000-0000-0000-0000-0000000bb981', '00000000-0000-0000-0000-0000000aa981', 'VAN', 'TEST-XK-981', 2800, 6, now()),
       ('00000000-0000-0000-0000-0000000bb982', '00000000-0000-0000-0000-0000000aa982', 'VAN', 'TEST-XK-982', 2800, 6, now());
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
values ('00000000-0000-0000-0000-0000000bb981', 'EUR', 2500, 60, 28, now()),
       ('00000000-0000-0000-0000-0000000bb982', 'EUR', 2500, 60, 28, now());
insert into public.service_areas (company_id, center, radius_km)
values ('00000000-0000-0000-0000-0000000aa981', 'SRID=4326;POINT(21.1655 42.6629)', 90),
       ('00000000-0000-0000-0000-0000000aa982', 'SRID=4326;POINT(21.1655 42.6629)', 90);
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000aa981', 'insurance', 'aa981/insurance.pdf', now() + interval '1 year', now()),
       ('00000000-0000-0000-0000-0000000aa982', 'insurance', 'aa982/insurance.pdf', now() + interval '1 year', now());

-- Names for the ids: customers C1, C2; movers M1, M2 with companies A1, A2 (one van each, V1, V2); an
-- admin; one move per case.
create temporary table ids (name text primary key, id uuid not null) on commit drop;
grant select on ids to authenticated, anon;
insert into ids values
  ('C1', '00000000-0000-0000-0000-00000000c981'), ('C2', '00000000-0000-0000-0000-00000000c982'),
  ('M1', '00000000-0000-0000-0000-00000000d981'), ('M2', '00000000-0000-0000-0000-00000000d982'),
  ('AD', '00000000-0000-0000-0000-00000000a981'),
  ('A1', '00000000-0000-0000-0000-0000000aa981'), ('A2', '00000000-0000-0000-0000-0000000aa982'),
  ('V1', '00000000-0000-0000-0000-0000000bb981'), ('V2', '00000000-0000-0000-0000-0000000bb982'),
  ('day',           '00000000-0000-0000-0000-0000000e9801'),  -- the whole day, step by step, with photos
  ('free',          '00000000-0000-0000-0000-0000000e9802'),  -- the customer cancels in the free time
  ('late',          '00000000-0000-0000-0000-0000000e9803'),  -- …late
  ('terms',         '00000000-0000-0000-0000-0000000e9804'),  -- …after the mover changed their terms
  ('at_pickup',     '00000000-0000-0000-0000-0000000e9805'),  -- …with the mover at the pickup
  ('mover_late',    '00000000-0000-0000-0000-0000000e9806'),  -- …the mover an hour late
  ('photo_in_time', '00000000-0000-0000-0000-0000000e9807'),  -- …a pickup photo in time, then late
  ('photo_after',   '00000000-0000-0000-0000-0000000e9808'),  -- …the first pickup photo only after the hour
  ('mover_cancel',  '00000000-0000-0000-0000-0000000e9809'),  -- the mover cancels
  ('absent',        '00000000-0000-0000-0000-0000000e9810'),  -- …the customer not there
  ('declined',      '00000000-0000-0000-0000-0000000e9811'),  -- the mover declines
  ('old',           '00000000-0000-0000-0000-0000000e9812'),  -- accepted, never marked
  ('other_mover',   '00000000-0000-0000-0000-0000000e9813'),  -- C2's move with M2
  ('window',        '00000000-0000-0000-0000-0000000e9814');  -- declined by M2, then accepted by M1
create temporary table notes (k text primary key, v text) on commit drop;
grant all on notes to authenticated;

create function pg_temp.id(p_name text) returns uuid language sql stable as $$
  select i.id from ids i where i.name = p_name
$$;
create function pg_temp.as_user(p_name text) returns text language sql as $$
  select set_config('request.jwt.claims',
    case when p_name is null then '' else json_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text end, true)
$$;
create function pg_temp.path(p_job text, p_stage text, p_file text) returns text language sql stable as $$
  select pg_temp.id(p_job)::text || '/' || p_stage || '/' || p_file
$$;

-- A saved request as `book` writes it (the mover's price 50.00 EUR; free cancellation until 48 hours
-- before, then 50 %), and the same booked (a test booking) and accepted by the company's owner.
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
create function pg_temp.accepted(p_job text, p_customer text, p_company text, p_van text, p_at timestamptz) returns uuid language plpgsql as $$
declare
  offer uuid;
begin
  perform pg_temp.saved(p_job, p_customer, p_company, p_van, p_at);
  offer := public.job_book(pg_temp.id(p_job), pg_temp.id(p_customer), true, '+38344123456');
  perform public.job_answer_offer(offer, (select c.owner_id from public.mover_companies c where c.id = pg_temp.id(p_company)), true);
  return pg_temp.id(p_job);
end;
$$;

-- The transitions, as `job-transition` calls them (the names above instead of ids).
create function pg_temp.step(p_job text, p_mover text, p_to text) returns text language sql as $$
  select public.job_step(pg_temp.id(p_job), pg_temp.id(p_mover), p_to::public.job_status)::text
$$;
create function pg_temp.cancel(p_job text, p_customer text, p_max_fee integer) returns integer language sql as $$
  select public.job_cancel(pg_temp.id(p_job), pg_temp.id(p_customer), p_max_fee)
$$;
create function pg_temp.mover_cancel(p_job text, p_mover text, p_reason text) returns text language sql as $$
  select public.job_mover_cancel(pg_temp.id(p_job), pg_temp.id(p_mover), p_reason)::text
$$;
create function pg_temp.confirm(p_job text, p_customer text) returns timestamptz language sql as $$
  select public.job_confirm(pg_temp.id(p_job), pg_temp.id(p_customer))
$$;
-- The DETAIL of the refusal a statement raises (the edge function passes it on as JSON); the statement
-- is rolled back.
create function pg_temp.detail(p_sql text) returns jsonb language plpgsql as $$
declare
  d text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d::jsonb;
end;
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

-- Photos as the mover's app adds them: the file into storage, then the row (as the signed-in user).
create function pg_temp.upload(p_job text, p_stage text, p_file text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner) values ('job-photos', pg_temp.path(p_job, p_stage, p_file), auth.uid())
$$;
create function pg_temp.add_photo(p_job text, p_stage text, p_file text) returns void language sql as $$
  insert into public.job_photos (job_id, stage, path) values (pg_temp.id(p_job), p_stage::public.job_photo_stage, pg_temp.path(p_job, p_stage, p_file))
$$;
create function pg_temp.photos_seen(p_job text) returns text language sql as $$
  select (select count(*) from public.job_photos where job_id = pg_temp.id(p_job)) || ' rows, '
      || (select count(*) from storage.objects where bucket_id = 'job-photos' and name like pg_temp.id(p_job)::text || '/%') || ' files'
$$;

-- What the signed-in mover's list says of a move: its status and whether the exact place is shown (all
-- 12 columns of the stops' exact place, directions and coordinates) or hidden.
create function pg_temp.listed(p_job text, p_include_ended boolean) returns text language sql as $$
  select coalesce((
    select m.status::text || ', exact place ' || case num_nonnulls(m.pickup_label, m.pickup_street, m.pickup_house_number, m.pickup_details,
        m.pickup_lat, m.pickup_lon, m.dropoff_label, m.dropoff_street, m.dropoff_house_number, m.dropoff_details, m.dropoff_lat, m.dropoff_lon)
      when 12 then 'shown' when 0 then 'hidden' else 'partly shown' end
    from public.my_mover_jobs(p_include_ended) m where m.job_id = pg_temp.id(p_job)), 'not listed')
$$;
create function pg_temp.readable(p_table regclass) returns text language sql stable as $$
  select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a
  where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', p_table, a.attname, 'select')
$$;

-- The fee rule for an arrival S = 22 Oct 2026 08:00 UTC, free until 48 hours before (20 Oct 08:00 UTC).
create function pg_temp.fee(p_price integer, p_pct integer, p_currency text, p_status text, p_photo_at timestamptz, p_at timestamptz)
returns text language sql as $$
  select coalesce(f.fee::text, 'null') || ' ' || coalesce(f.rule, 'null')
  from public.cancellation_fee(p_price, p_pct, p_currency::public.currency_code, '2026-10-20 08:00Z', '2026-10-22 08:00Z',
    p_status::public.job_status, p_photo_at, p_at) f
$$;

-- A booked move is frozen (20261017120000) and the log and photos are append-only: only the test moves
-- their times, to put "now" where a case needs it.
create function pg_temp.reschedule(p_job text, p_at timestamptz) returns void language plpgsql as $$
begin
  alter table public.jobs disable trigger jobs_keep_booked_facts;
  update public.jobs set scheduled_at = p_at where id = pg_temp.id(p_job);
  alter table public.jobs enable trigger jobs_keep_booked_facts;
end;
$$;
create function pg_temp.back_date(p_job text, p_event text, p_by interval) returns void language plpgsql as $$
begin
  alter table public.job_events disable trigger job_events_keep;
  update public.job_events set created_at = created_at - p_by where job_id = pg_temp.id(p_job) and (p_event is null or event = p_event);
  alter table public.job_events enable trigger job_events_keep;
end;
$$;
create function pg_temp.back_date_photos(p_job text, p_to timestamptz) returns void language plpgsql as $$
begin
  set constraints all immediate;  -- a table with checks still pending can't be altered
  alter table public.job_photos disable trigger job_photos_keep;
  update public.job_photos set taken_at = p_to where job_id = pg_temp.id(p_job);
  alter table public.job_photos enable trigger job_photos_keep;
  set constraints all deferred;
end;
$$;

-- A cancellation record written directly (as only the job functions do), for the table's own checks.
create function pg_temp.cancellation_record(p_by text, p_status_before text, p_reason text, p_fee integer, p_rule text)
returns void language sql as $$
  insert into public.job_cancellations (job_id, offer_id, quote_id, mover_company_id, cancelled_by, status_before, reason,
    scheduled_at, cancel_free_hours, cancel_late_pct, free_until, mover_price, currency, fee, fee_rule)
  select o.job_id, o.id, o.quote_id, o.mover_company_id, p_by, p_status_before::public.job_status, p_reason,
    now(), 48, 50, now() - interval '48 hours', 5000, 'EUR', p_fee, p_rule
  from public.job_offers o where o.job_id = pg_temp.id('old') and o.status = 'accepted'
$$;

-- The moves, each booked and accepted by the mover the customer chose.
select pg_temp.accepted('day', 'C1', 'A1', 'V1', now() + interval '6 hours 1 second');
select pg_temp.accepted('free', 'C1', 'A1', 'V1', now() + interval '3 days');
select pg_temp.accepted('late', 'C1', 'A1', 'V1', now() + interval '24 hours');
select pg_temp.accepted('terms', 'C1', 'A1', 'V1', now() + interval '24 hours');
select pg_temp.accepted('at_pickup', 'C1', 'A1', 'V1', now() + interval '5 hours');
select pg_temp.accepted('mover_late', 'C1', 'A1', 'V1', now() + interval '5 hours');
select pg_temp.accepted('photo_in_time', 'C1', 'A1', 'V1', now() + interval '5 hours');
select pg_temp.accepted('photo_after', 'C1', 'A1', 'V1', now() + interval '5 hours');
select pg_temp.accepted('mover_cancel', 'C1', 'A1', 'V1', now() + interval '3 days');
select pg_temp.accepted('absent', 'C1', 'A1', 'V1', now() + interval '5 hours');
select pg_temp.accepted('old', 'C1', 'A1', 'V1', now() + interval '3 days');
select pg_temp.accepted('other_mover', 'C2', 'A2', 'V2', now() + interval '5 hours');

-- The other mover's move, at its pickup with a photo.
do $$
begin
  perform pg_temp.step('other_mover', 'M2', 'EN_ROUTE_TO_PICKUP');
  perform pg_temp.step('other_mover', 'M2', 'AT_PICKUP');
end;
$$;
set local role authenticated;
select pg_temp.as_user('M2');
select pg_temp.upload('other_mover', 'pickup', 'm2photo1.jpg');
select pg_temp.add_photo('other_mover', 'pickup', 'm2photo1.jpg');
reset role;
select pg_temp.as_user(null);

-- 1. The structure ----------------------------------------------------------------------------------

select is(
  (select string_agg(c.relname || ' ' || c.relrowsecurity, ', ' order by c.relname) from pg_class c
   where c.oid in ('public.job_photos'::regclass, 'public.job_cancellations'::regclass)),
  'job_cancellations true, job_photos true', 'row-level security is on for the photos and the cancellation records');
select is(
  (select public || ' ' || file_size_limit || ' ' || allowed_mime_types::text from storage.buckets where id = 'job-photos'),
  'false 10485760 {image/jpeg,image/png,image/webp}', 'the photo bucket is private, 10 MB a file, JPEG, PNG or WebP (no HEIC: browsers can''t show it)');
select is(
  (select string_agg(f, '; ') from unnest(array[
     'public.job_step(uuid, uuid, public.job_status)', 'public.job_cancel(uuid, uuid, integer)',
     'public.job_mover_cancel(uuid, uuid, text)', 'public.job_confirm(uuid, uuid)',
     'public.cancellation_fee(integer, integer, public.currency_code, timestamptz, timestamptz, public.job_status, timestamptz, timestamptz)',
     'public.cancellation_free_until(timestamptz, integer)', 'public.erase_jobs(uuid[])']) f
   where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')
      or not has_function_privilege('service_role', f, 'execute')),
  null, 'steps, cancelling, confirming, the fee rule and erasing run only for the server (job-transition), never for a signed-in user');
select is(
  (select string_agg(f, '; ') from unnest(array[
     'public.try_uuid(text)', 'public.keep_evidence()', 'public.job_status_change_allowed(public.job_status, public.job_status)',
     'public.jobs_check_status_change()', 'public.jobs_keep_records()', 'public.job_photos_check()',
     'public.on_my_way_from(timestamptz)', 'public.job_step_from(public.job_status)']) f
   where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  null, '…nor the rules'' building blocks');
select is(
  (select string_agg(f || ' ' || has_function_privilege('authenticated', f, 'execute') || '/' || has_function_privilege('anon', f, 'execute'), '; ' order by f)
   from unnest(array['public.can_add_job_photo_file(text)', 'public.can_read_job_photo_file(text)', 'public.my_mover_jobs(boolean)']) f),
  'public.can_add_job_photo_file(text) true/false; public.can_read_job_photo_file(text) true/false; public.my_mover_jobs(boolean) true/false',
  'signed-in users run the storage rules'' photo checks and their own job list; visitors don''t');
select ok(to_regprocedure('public.job_cancel(uuid, uuid)') is null and to_regprocedure('public.my_mover_jobs()') is null,
  'the 5.1 signatures are replaced (a call without the new argument finds the new function)');
select ok(
  not has_table_privilege('authenticated', 'public.job_cancellations', 'insert, update, delete, truncate')
  and not has_table_privilege('authenticated', 'public.job_photos', 'insert, update, delete, truncate')
  and not has_table_privilege('authenticated', 'public.job_events', 'insert, update, delete, truncate')
  and not has_table_privilege('anon', 'public.job_photos', 'select, insert')
  and not has_table_privilege('anon', 'public.job_cancellations', 'select, insert'),
  'signed-in users never write cancellation records or the log, nor change or remove photo rows; visitors get nothing');
select is(
  (select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a
   where a.attrelid = 'public.job_photos'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attname, 'insert')),
  'job_id,stage,path', 'the mover''s app adds a photo row naming the move, the stop and the file — nothing else');
select is(pg_temp.readable('public.job_events'), 'id,job_id,event,status,actor_role,created_at',
  'signed-in users read the log without the account ids of who took each step');
select is(pg_temp.readable('public.job_photos'), 'id,job_id,stage,path,taken_at', '…the photo rows without who added them');
select is(pg_temp.readable('public.job_cancellations'),
  'id,job_id,cancelled_by,status_before,reason,scheduled_at,cancel_free_hours,cancel_late_pct,free_until,mover_price,currency,fee,fee_rule,created_at',
  '…the cancellation records without account, offer, quote or company ids');
select is(
  (select string_agg(v.t || '.' || v.c, ', ') from (values ('job_events', 'actor_id'), ('job_photos', 'uploaded_by'), ('job_cancellations', 'actor_id')) v (t, c)
   where not exists (
     select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = ('public.' || v.t)::regclass and a.attname = v.c)),
  null, 'deleting an account finds the rows that name it through an index');

-- 2. The rules --------------------------------------------------------------------------------------

-- Status changes, for every writer.
select is(public.job_status_change_allowed('OFFERED', 'QUOTED'), true, 'declined or expired: the move goes back to the customer');
select is(public.job_status_change_allowed('ACCEPTED', 'QUOTED'), false, 'accepted, never back to a request (a mover''s cancellation closes the move)');
select is(public.job_status_change_allowed('AT_PICKUP', 'QUOTED'), false, '…nor once under way');
select is(public.job_status_change_allowed('ACCEPTED', 'AT_PICKUP'), false, 'no step is skipped');
select is(public.job_status_change_allowed('IN_TRANSIT', 'CANCELLED'), true,
  'loaded, a move can still be ended by MoversHub''s own tools later (in the app nobody cancels it)');
select is(public.job_status_change_allowed('AT_DROPOFF', 'CANCELLED'), true, '…also at the drop-off');
select is(public.job_status_change_allowed('COMPLETED', 'CANCELLED'), false, 'a move done is never cancelled');
select is(public.job_status_change_allowed('CANCELLED', 'ACCEPTED'), false, 'cancelled is for good');

-- Until when cancelling is free.
select is(public.cancellation_free_until('2026-10-22 08:00Z', 48), '2026-10-20 08:00Z'::timestamptz, 'free until the arrival time minus the mover''s hours');
select is(public.cancellation_free_until('2026-10-25 12:00Z', 24), '2026-10-24 12:00Z'::timestamptz, '…counted in hours, also across a clock change');
select is(public.cancellation_free_until('2026-10-30 08:00Z', 168), '2026-10-23 08:00Z'::timestamptz,
  '7 days across the autumn clock change: 168 hours (the later of the two)');
select is(public.cancellation_free_until('2027-04-01 07:00Z', 168), '2027-03-25 08:00Z'::timestamptz,
  '7 days across the spring clock change: the same time of day a week before, never an hour less');

-- The fee: arrival 22 Oct 08:00 UTC, free until 20 Oct 08:00 UTC, then 50 % of 50.00 EUR.
select is(pg_temp.fee(5000, 50, 'EUR', 'ACCEPTED', null, '2026-10-20 07:59:59Z'), '0 free_period', 'a second before the free time ends: free');
select is(pg_temp.fee(5000, 50, 'EUR', 'ACCEPTED', null, '2026-10-20 08:00:00Z'), '0 free_period', 'at the very moment it ends: still free ("until" includes it)');
select is(pg_temp.fee(5000, 50, 'EUR', 'ACCEPTED', null, '2026-10-20 08:00:01Z'), '2500 late', 'a second later: the mover''s 50 %');
select is(pg_temp.fee(5000, 50, 'EUR', 'EN_ROUTE_TO_PICKUP', null, '2026-10-22 08:59:59Z'), '2500 late',
  'on the way 59 min 59 s after the arrival time: still the late fee');
select is(pg_temp.fee(5000, 50, 'EUR', 'EN_ROUTE_TO_PICKUP', null, '2026-10-22 09:00:00Z'), '0 mover_late',
  'on the way an hour after the arrival time: free (the mover is late)');
select is(pg_temp.fee(5000, 50, 'EUR', 'ACCEPTED', null, '2026-10-22 09:00:00Z'), '0 mover_late', 'not even on the way an hour after: free');
select is(pg_temp.fee(5000, 50, 'EUR', 'AT_PICKUP', null, '2026-10-22 09:00:00Z'), '0 mover_late',
  '"arrived" an hour after, without a pickup photo: free (arriving alone is the mover''s word)');
select is(pg_temp.fee(5000, 50, 'EUR', 'AT_PICKUP', null, '2026-10-22 08:59:59Z'), '2500 late', 'at the pickup before the hour is up: the late fee');
select is(pg_temp.fee(5000, 50, 'EUR', 'AT_PICKUP', '2026-10-22 08:30Z', '2026-10-22 10:00Z'), '2500 late',
  'a pickup photo 30 minutes after the arrival time shows the mover was there: the late fee, also later');
select is(pg_temp.fee(5000, 50, 'EUR', 'AT_PICKUP', '2026-10-22 09:00Z', '2026-10-22 10:00Z'), '0 mover_late', 'the first pickup photo only at the hour: free');
select is(pg_temp.fee(5000, 50, 'EUR', 'AT_PICKUP', '2026-10-22 09:01Z', '2026-10-22 10:00Z'), '0 mover_late', '…or after it: free');
select is(pg_temp.fee(5000, 0, 'EUR', 'ACCEPTED', null, '2026-10-21 08:00Z'), '0 terms_free', 'terms with 0 %: nothing after the free time either');
select is(pg_temp.fee(5000, 0, 'EUR', 'ACCEPTED', null, '2026-10-20 08:00Z'), '0 free_period', '…the free time is still named as such');
select is(pg_temp.fee(5001, 50, 'EUR', 'ACCEPTED', null, '2026-10-21 08:00Z'), '2500 late', '50 % of 50.01 EUR: 25.00 (rounded down)');
select is(pg_temp.fee(5001, 25, 'EUR', 'ACCEPTED', null, '2026-10-21 08:00Z'), '1250 late', '25 % of 50.01 EUR: 12.50');
select is(pg_temp.fee(4999, 25, 'EUR', 'ACCEPTED', null, '2026-10-21 08:00Z'), '1249 late', '25 % of 49.99 EUR: 12.49');
select is(pg_temp.fee(5001, 100, 'EUR', 'ACCEPTED', null, '2026-10-21 08:00Z'), '5001 late', '100 %: the whole price');
select is(pg_temp.fee(153000, 25, 'ALL', 'ACCEPTED', null, '2026-10-21 08:00Z'), '38200 late', '25 % of 1 530 lek: 382 lek (whole lek, rounded down)');
select is(pg_temp.fee(99900, 50, 'MKD', 'ACCEPTED', null, '2026-10-21 08:00Z'), '49900 late', '50 % of 999 denar: 499 denar');
select is(pg_temp.fee(100000, 100, 'RSD', 'ACCEPTED', null, '2026-10-21 08:00Z'), '100000 late', '100 % of 1 000 dinar');
select is(pg_temp.fee(5000, 50, 'EUR', 'IN_TRANSIT', null, '2026-10-21 08:00Z'), 'null null', 'loaded: no fee (not cancelled in the app)');
select is(pg_temp.fee(5000, 50, 'EUR', 'OFFERED', null, '2026-10-21 08:00Z'), 'null null', 'not accepted yet: no fee (cancelling is free)');

-- 3. The day, step by step (the move 6 hours and a second from now) ---------------------------------

select throws_ok($$ update public.jobs set status = 'COMPLETED' where id = pg_temp.id('day') $$, '22023', 'status_change_not_allowed',
  'not even the server jumps an accepted move to done: status_change_not_allowed');
select throws_ok($$ select pg_temp.step('day', 'M2', 'EN_ROUTE_TO_PICKUP') $$, 'P0002', 'not_found',
  'only the mover who accepted the move marks its steps: not_found for another mover');
select throws_ok($$ select pg_temp.step('day', 'C1', 'EN_ROUTE_TO_PICKUP') $$, 'P0002', 'not_found', '…and for the customer');
select throws_ok($$ select pg_temp.step('day', 'M1', 'ACCEPTED') $$, '22023', 'invalid_step', 'accepting is not a step: invalid_step');
select throws_ok($$ select pg_temp.step('day', 'M1', 'CANCELLED') $$, '22023', 'invalid_step', '…nor is cancelling');
select throws_ok($$ select pg_temp.step('day', 'M2', 'ACCEPTED') $$, '22023', 'invalid_step', '…whoever asks (the step is checked first)');
select throws_ok($$ select pg_temp.step('day', 'M1', 'AT_PICKUP') $$, '22023', 'wrong_step', 'one step at a time: not at the pickup before being on the way');
select throws_ok($$ select pg_temp.step('day', 'M1', 'EN_ROUTE_TO_PICKUP') $$, '22023', 'too_early', 'more than 6 hours before the arrival time: too_early');
select is((pg_temp.detail($$ select pg_temp.step('day', 'M1', 'EN_ROUTE_TO_PICKUP') $$) ->> 'from')::timestamptz, now() + interval '1 second',
  '…saying from when: 6 hours before the arrival time');
select pg_temp.reschedule('day', now() + interval '6 hours');
select is(pg_temp.step('day', 'M1', 'EN_ROUTE_TO_PICKUP'), 'EN_ROUTE_TO_PICKUP', 'from exactly 6 hours before: on my way');
select is(pg_temp.step('day', 'M1', 'EN_ROUTE_TO_PICKUP'), 'EN_ROUTE_TO_PICKUP', 'the same step again changes nothing (a retry)…');
select is((select count(*)::int from public.job_events where job_id = pg_temp.id('day') and event = 'en_route_to_pickup'), 1, '…one event');

set local role authenticated;
select pg_temp.as_user('M1');
select is(pg_temp.listed('day', false), 'EN_ROUTE_TO_PICKUP, exact place shown', 'on the way, the mover has the exact place and the customer''s directions');
select is(
  (select (on_my_way_from = scheduled_at - interval '6 hours') || ' ' || (last_event_at = now()) || ' ' || coalesce(ended_at::text, '-')
       || ' ' || coalesce(absent_reason_from::text, '-')
   from public.my_mover_jobs() where job_id = pg_temp.id('day')),
  'true true - -', '…from when "On my way" could be marked and the last step''s time; not ended, not at the pickup');
reset role;
select pg_temp.as_user(null);

select is(pg_temp.step('day', 'M1', 'AT_PICKUP'), 'AT_PICKUP', 'arrived at the pickup');
select throws_ok($$ select pg_temp.step('day', 'M1', 'EN_ROUTE_TO_PICKUP') $$, '22023', 'wrong_step', 'never a step back');
select throws_ok($$ select pg_temp.step('day', 'M1', 'IN_TRANSIT') $$, '22023', 'photos_required', 'a pickup photo is needed before leaving: photos_required');

-- The log: each step once, with the status it leads to; append-only.
select throws_ok($$ insert into public.job_events (job_id, event, status, actor_role) values (pg_temp.id('day'), 'in_transit', 'AT_PICKUP', 'mover') $$,
  '23514', null, 'a step''s event always carries the status it leads to');
select throws_ok($$ insert into public.job_events (job_id, event, status, actor_role) values (pg_temp.id('day'), 'at_pickup', 'AT_PICKUP', 'mover') $$,
  '23505', null, 'each step is in the log once');
select throws_ok($$ update public.job_events set event = 'declined' where job_id = pg_temp.id('day') and event = 'booked' $$,
  '22023', 'evidence_kept', 'the log is never changed: evidence_kept');
select lives_ok($$ update public.job_events set actor_id = null where job_id = pg_temp.id('free') and event = 'booked' $$,
  '…except an account id, set to null when that account is deleted');

-- 4. Photos at the pickup: evidence, not control (COMPLIANCE §2, §7) --------------------------------

set local role authenticated;
select pg_temp.as_user('M1');
select lives_ok($$ select pg_temp.upload('day', 'pickup', 'a1b2c3d4.jpg') $$, 'at the pickup, the mover uploads a photo into the move''s pickup folder');
select throws_ok($$ select pg_temp.upload('day', 'dropoff', 'a1b2c3d4.jpg') $$, '42501', null, '…not into the drop-off folder before arriving there');
select throws_ok($$ select pg_temp.upload('day', 'pickup', 'x.html') $$, '42501', null, '…only a photo with a generated name, no other file');
select throws_ok($$ select pg_temp.upload('day', 'pickup', 'a1b2c3d4.heic') $$, '42501', null, '…JPEG, PNG or WebP');
select throws_ok($$ select pg_temp.upload('day', 'pickup', 'sub/a1b2c3d4.jpg') $$, '42501', null, '…no folders inside the stop''s');
select throws_ok($$ select pg_temp.upload('other_mover', 'pickup', 'a1b2c3d4.jpg') $$, '42501', null, '…not into another mover''s move');
select throws_ok($$ select pg_temp.upload('free', 'pickup', 'a1b2c3d4.jpg') $$, '42501', null, '…not into their move that hasn''t started (accepted)');
select throws_ok($$ select pg_temp.add_photo('day', 'pickup', 'nofile01.jpg') $$, '22023', 'photo_file_missing',
  'a photo row needs its file in storage: photo_file_missing');
select throws_ok($$ select pg_temp.add_photo('day', 'dropoff', 'a1b2c3d4.jpg') $$, '22023', 'photo_stage_closed', 'no drop-off photo at the pickup: photo_stage_closed');
select throws_ok(
  $$ insert into public.job_photos (job_id, stage, path) values (pg_temp.id('day'), 'pickup', pg_temp.path('other_mover', 'pickup', 'm2photo1.jpg')) $$,
  '22023', 'photo_path_outside_job', 'a file of another move: photo_path_outside_job');
select throws_ok(
  $$ insert into public.job_photos (job_id, stage, path, taken_at)
     values (pg_temp.id('day'), 'pickup', pg_temp.path('day', 'pickup', 'a1b2c3d4.jpg'), now() - interval '1 day') $$,
  '42501', null, 'when a photo was added is the server''s time: the app can''t name it');
select lives_ok($$ select pg_temp.add_photo('day', 'pickup', 'a1b2c3d4.jpg') $$, 'the mover adds the photo to the move');
select throws_ok($$ select pg_temp.add_photo('day', 'pickup', 'a1b2c3d4.jpg') $$, '23505', null, 'the same photo again: 23505 (the app counts it as saved)');
select pg_temp.as_user('M2');
select throws_ok($$ select pg_temp.upload('day', 'pickup', 'm2photo2.jpg') $$, '42501', null, 'another mover can''t upload into the move');
select throws_ok($$ select pg_temp.add_photo('day', 'pickup', 'a1b2c3d4.jpg') $$, 'P0002', 'not_found', '…nor add photos to it: not_found');
select pg_temp.as_user('C1');
select throws_ok($$ select pg_temp.upload('day', 'pickup', 'c1photo1.jpg') $$, '42501', null, 'the customer doesn''t upload into it either…');
select throws_ok($$ select pg_temp.add_photo('day', 'pickup', 'a1b2c3d4.jpg') $$, 'P0002', 'not_found', '…nor add photos: not_found');
reset role;
select pg_temp.as_user(null);
select is(
  (select (p.offer_id = o.id) || ' ' || (p.uploaded_by = pg_temp.id('M1')) || ' ' || (p.taken_at = now())
   from public.job_photos p join public.job_offers o on o.job_id = p.job_id and o.status = 'accepted'
   where p.path = pg_temp.path('day', 'pickup', 'a1b2c3d4.jpg')),
  'true true true', 'the row names the accepted offer, who added it and the server''s time (set by the database)');

-- At most 20 photos a stop, 30 files a folder.
set local role authenticated;
select pg_temp.as_user('M1');
do $$
begin
  for i in 2..20 loop
    perform pg_temp.upload('day', 'pickup', 'p' || lpad(i::text, 6, '0') || '.jpg');
    perform pg_temp.add_photo('day', 'pickup', 'p' || lpad(i::text, 6, '0') || '.jpg');
  end loop;
end;
$$;
select lives_ok($$ select pg_temp.upload('day', 'pickup', 'p000021.jpg') $$, 'a 21st file uploads…');
select throws_ok($$ select pg_temp.add_photo('day', 'pickup', 'p000021.jpg') $$, '22023', 'too_many_photos',
  '…but a stop has at most 20 photos: too_many_photos');
select throws_ok($$ select pg_temp.add_photo('day', 'pickup', 'p000020.jpg') $$, '23505', null,
  '…while the 20th sent again (its answer lost) is the duplicate it is — saved — not too_many_photos');
do $$
begin
  for i in 22..30 loop
    perform pg_temp.upload('day', 'pickup', 'p' || lpad(i::text, 6, '0') || '.jpg');
  end loop;
end;
$$;
select throws_ok($$ select pg_temp.upload('day', 'pickup', 'p000031.jpg') $$, '42501', null,
  'at most 30 files in a stop''s folder (files no row uses are swept later)');

-- Who sees them: the customer, the mover and admins.
select is(pg_temp.photos_seen('day'), '20 rows, 30 files', 'the mover reads the photos of their move');
select pg_temp.as_user('C1');
select is(pg_temp.photos_seen('day'), '20 rows, 30 files', 'the customer reads them');
select pg_temp.as_user('AD');
select is(pg_temp.photos_seen('day'), '20 rows, 30 files', 'admins read them');
select pg_temp.as_user('M2');
select is(pg_temp.photos_seen('day'), '0 rows, 0 files', 'another mover reads none…');
select is(pg_temp.photos_seen('other_mover'), '1 rows, 1 files', '…only those of their own move');
select pg_temp.as_user('C2');
select is(pg_temp.photos_seen('day'), '0 rows, 0 files', 'another customer reads none');
set local role anon;
select pg_temp.as_user(null);
select throws_ok($$ select id from public.job_photos $$, '42501', null, 'visitors get no photo rows…');
select is((select count(*)::int from storage.objects where bucket_id = 'job-photos'), 0, '…and no files');

-- Never changed or removed by a client.
set local role authenticated;
select pg_temp.as_user('M1');
select throws_ok($$ update public.job_photos set path = path where job_id = pg_temp.id('day') $$, '42501', null, 'the mover can''t change a photo row…');
select throws_ok($$ delete from public.job_photos where job_id = pg_temp.id('day') $$, '42501', null, '…nor remove one');
-- Supabase refuses a DELETE on its storage tables from SQL unless storage.allow_delete_query is set —
-- any role can set it, so the bucket's own rules must hold without that guard.
do $$
declare
  n integer;
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'job-photos' and name = pg_temp.path('day', 'pickup', 'a1b2c3d4.jpg');
  get diagnostics n = row_count;
  insert into notes values ('files deleted', n);
  update storage.objects set metadata = '{"size": 1}' where bucket_id = 'job-photos' and name = pg_temp.path('day', 'pickup', 'a1b2c3d4.jpg');
  get diagnostics n = row_count;
  insert into notes values ('files updated', n);
  perform set_config('storage.allow_delete_query', 'false', true);
end;
$$;
select is((select v from notes where k = 'files deleted') || ' deleted, ' || (select v from notes where k = 'files updated') || ' updated',
  '0 deleted, 0 updated', 'the mover can''t remove or replace a photo file (the bucket has no delete or update rule)');
reset role;
select pg_temp.as_user(null);
select is(
  (select count(*) || ' ' || coalesce(max(metadata::text), 'unchanged') from storage.objects
   where bucket_id = 'job-photos' and name = pg_temp.path('day', 'pickup', 'a1b2c3d4.jpg')),
  '1 unchanged', '…the file is still there, unchanged');
select throws_ok(
  $$ update public.job_photos set path = pg_temp.path('day', 'pickup', 'zzzzzz01.jpg') where path = pg_temp.path('day', 'pickup', 'a1b2c3d4.jpg') $$,
  '22023', 'evidence_kept', 'not even the server changes a photo row: evidence_kept');
select lives_ok($$ update public.job_photos set uploaded_by = null where path = pg_temp.path('day', 'pickup', 'p000002.jpg') $$,
  '…except who added it, set to null when that account is deleted');

-- 5. Loaded, the drop-off, done --------------------------------------------------------------------

select is(pg_temp.step('day', 'M1', 'IN_TRANSIT'), 'IN_TRANSIT', 'with a pickup photo: loaded, leaving');
set local role authenticated;
select pg_temp.as_user('M1');
select throws_ok($$ select pg_temp.upload('day', 'pickup', 'late0001.jpg') $$, '42501', null, 'once loaded, no more pickup files…');
select throws_ok($$ select pg_temp.add_photo('day', 'pickup', 'p000021.jpg') $$, '22023', 'photo_stage_closed', '…nor pickup photos: photo_stage_closed');
select throws_ok($$ select pg_temp.add_photo('day', 'pickup', 'a1b2c3d4.jpg') $$, '23505', null,
  '…while a saved pickup photo sent again is the duplicate — saved — not photo_stage_closed');
reset role;
select pg_temp.as_user(null);
select throws_ok($$ select pg_temp.cancel('day', 'C1', 100000) $$, '22023', 'not_cancellable',
  'once loaded, the customer doesn''t cancel in the app: not_cancellable');
select throws_ok($$ select pg_temp.mover_cancel('day', 'M1', null) $$, '22023', 'not_cancellable', '…nor the mover');
select is(pg_temp.step('day', 'M1', 'AT_DROPOFF'), 'AT_DROPOFF', 'arrived at the drop-off');
select throws_ok($$ select pg_temp.mover_cancel('day', 'M1', 'cannot_do') $$, '22023', 'not_cancellable', 'at the drop-off nobody cancels in the app either');
select throws_ok($$ select pg_temp.confirm('day', 'C1') $$, '22023', 'not_confirmable', 'the customer confirms only a move marked done: not_confirmable');
select throws_ok($$ select pg_temp.step('day', 'M1', 'COMPLETED') $$, '22023', 'photos_required', 'a drop-off photo is needed before "Move done": photos_required');
set local role authenticated;
select pg_temp.as_user('M1');
select lives_ok($$ select pg_temp.upload('day', 'dropoff', 'd1e2f3a4.jpg') $$, 'at the drop-off the mover uploads a photo…');
select throws_ok(
  $$ insert into public.job_photos (job_id, stage, path) values (pg_temp.id('day'), 'dropoff', pg_temp.path('day', 'dropoff', 'd1e2f3a4.jpg')) returning * $$,
  '42501', null, '…asking for the whole row back is refused (who added it isn''t readable)…');
select lives_ok(
  $$ insert into public.job_photos (job_id, stage, path) values (pg_temp.id('day'), 'dropoff', pg_temp.path('day', 'dropoff', 'd1e2f3a4.jpg'))
     returning id, job_id, stage, path, taken_at $$,
  '…adding it and reading back the readable columns works');
reset role;
select pg_temp.as_user(null);
insert into storage.objects (bucket_id, name) values ('job-photos', pg_temp.path('day', 'dropoff', 'srv00001.jpg'));
select lives_ok($$ select pg_temp.add_photo('day', 'dropoff', 'srv00001.jpg') $$, 'the server can add a photo too (the checks run for every writer)…');
select is((select (uploaded_by is null) || ' ' || (offer_id is not null) || ' ' || (taken_at = now()) from public.job_photos where path = pg_temp.path('day', 'dropoff', 'srv00001.jpg')),
  'true true true', '…kept with the accepted offer, added by no signed-in account');
select is(pg_temp.step('day', 'M1', 'COMPLETED'), 'COMPLETED', 'with a drop-off photo: move done');
select is(pg_temp.step('day', 'M1', 'COMPLETED'), 'COMPLETED', '"Move done" again: a retry, nothing changes');
select throws_ok($$ select pg_temp.step('day', 'M1', 'AT_DROPOFF') $$, '22023', 'wrong_step', 'after the move, no other step');
select throws_ok($$ select pg_temp.cancel('day', 'C1', 100000) $$, '22023', 'not_cancellable', 'a move done is not cancelled');
select is((select string_agg(event || '>' || status, ',' order by id) from public.job_events where job_id = pg_temp.id('day')),
  'booked>BOOKED,offered>OFFERED,accepted>ACCEPTED,en_route_to_pickup>EN_ROUTE_TO_PICKUP,at_pickup>AT_PICKUP,in_transit>IN_TRANSIT,at_dropoff>AT_DROPOFF,completed>COMPLETED',
  'the move''s log: every step once, in order');
select is(
  (select string_agg(distinct actor_role || ' ' || (actor_id = pg_temp.id('M1')), ', ') from public.job_events
   where job_id = pg_temp.id('day') and event in ('en_route_to_pickup', 'at_pickup', 'in_transit', 'at_dropoff', 'completed')),
  'mover true', '…each step by the mover');
select throws_ok($$ update public.jobs set status = 'ACCEPTED' where id = pg_temp.id('day') $$, '22023', 'status_change_not_allowed',
  'a move done never goes back: status_change_not_allowed');

-- The customer confirms the move is done (the hook for releasing the payout later).
select throws_ok($$ select pg_temp.confirm('day', 'M1') $$, 'P0002', 'not_found', 'only the move''s customer confirms it');
select is(pg_temp.confirm('day', 'C1'), now(), 'the customer confirms the move is done');
select pg_temp.back_date('day', 'confirmed', interval '1 minute');
select is(pg_temp.confirm('day', 'C1'), now() - interval '1 minute', 'confirming again answers the time of the first confirmation…');
select is((select count(*)::int from public.job_events where job_id = pg_temp.id('day') and event = 'confirmed'), 1, '…logged once');

set local role authenticated;
select pg_temp.as_user('M1');
select is(pg_temp.listed('day', false), 'not listed', 'a move done leaves the list of open requests and moves (what older app builds ask for)');
select is(pg_temp.listed('day', true), 'COMPLETED, exact place shown', 'with the ended moves: listed, the exact place kept for 7 days');
select is((select (ended_at = now()) || ' ' || (confirmed_at = now() - interval '1 minute') from public.my_mover_jobs(true) where job_id = pg_temp.id('day')),
  'true true', '…with when it ended and when the customer confirmed it');
reset role;
select pg_temp.as_user(null);
select pg_temp.back_date('day', 'completed', interval '8 days');
set local role authenticated;
select pg_temp.as_user('M1');
select is(pg_temp.listed('day', true), 'not listed', '8 days after it ended, the move is no longer listed');
select pg_temp.as_user('M2');
select is((select count(*)::int from public.my_mover_jobs(true) where job_id in (select id from ids where name <> 'other_mover')), 0,
  'another mover sees none of these moves…');
select is(pg_temp.listed('other_mover', false), 'AT_PICKUP, exact place shown', '…only their own');
reset role;
select pg_temp.as_user(null);

-- 6. The customer cancels after acceptance, under the terms of the quote they booked ----------------

-- In the free time (the move in 3 days).
select is(pg_temp.cancel('free', 'C1', 0), 0, 'in the free time, cancelling an accepted move costs nothing');
select is((select j.status || ' ' || o.status from public.jobs j join public.job_offers o on o.job_id = j.id where j.id = pg_temp.id('free')),
  'CANCELLED accepted', '…the move is cancelled; the offer stays accepted (the record of the contract)');
select is(
  (select cancelled_by || ' ' || (actor_id = pg_temp.id('C1')) || ' ' || status_before || ' ' || fee || ' ' || currency || ' ' || fee_rule || ' '
       || (free_until = scheduled_at - interval '48 hours') || ' ' || cancel_free_hours || '/' || cancel_late_pct || ' ' || mover_price
   from public.job_cancellations where job_id = pg_temp.id('free')),
  'customer true ACCEPTED 0 EUR free_period true 48/50 5000', '…recorded with the terms, the price and the rule that set the fee');
select is((select count(*) || ' ' || min(actor_role) from public.job_events where job_id = pg_temp.id('free') and event = 'cancelled'),
  '1 customer', '…and logged once, by the customer');
select is(pg_temp.cancel('free', 'C1', 0), 0, 'cancelling again answers the same (a retry)');
select throws_ok($$ select pg_temp.step('free', 'M1', 'EN_ROUTE_TO_PICKUP') $$, '22023', 'job_cancelled',
  'a move the customer cancelled has no more steps: job_cancelled');
select throws_ok($$ select pg_temp.mover_cancel('free', 'M1', null) $$, '22023', 'job_cancelled', '…and the mover doesn''t cancel it again: job_cancelled');

-- Late (the move in 24 hours): 50 % of 50.00 EUR, never more than the customer was shown.
select throws_ok($$ select pg_temp.cancel('late', 'C2', 100000) $$, 'P0002', 'not_found', 'only the move''s customer cancels it');
select throws_ok($$ select pg_temp.cancel('late', 'C1', 0) $$, '22023', 'fee_changed', 'late, shown no fee: fee_changed (nobody pays what they didn''t see)');
select throws_ok($$ select public.job_cancel(pg_temp.id('late'), pg_temp.id('C1')) $$, '22023', 'fee_changed',
  'an older app sends no fee: counted as 0, so never an unseen charge');
select is(
  (select (x.d ->> 'fee') || ' ' || (x.d ->> 'currency') || ' ' || ((x.d ->> 'freeUntil')::timestamptz = j.scheduled_at - interval '48 hours')
       || ' ' || (select count(*) from jsonb_object_keys(x.d))
   from public.jobs j, pg_temp.detail($$ select pg_temp.cancel('late', 'C1', 0) $$) as x (d) where j.id = pg_temp.id('late')),
  '2500 EUR true 3', '…saying the fee, its currency and until when it was free');
select is(
  (select j.status || ' ' || (select count(*) from public.job_cancellations x where x.job_id = j.id) || ' '
       || (select count(*) from public.job_events e where e.job_id = j.id and e.event = 'cancelled')
   from public.jobs j where j.id = pg_temp.id('late')),
  'ACCEPTED 0 0', '…and nothing is written');
select is(pg_temp.cancel('late', 'C1', 2500), 2500, 'shown 25.00 EUR, the customer cancels: the mover''s 50 %');
select is((select fee || ' ' || fee_rule || ' ' || status_before from public.job_cancellations where job_id = pg_temp.id('late')),
  '2500 late ACCEPTED', '…recorded (nothing is charged before card payments)');
select is(pg_temp.cancel('late', 'C1', 0), 2500, 'a retry answers the recorded fee…');
select is((select count(*)::int from public.job_cancellations where job_id = pg_temp.id('late')), 1, '…recorded once');
select throws_ok($$ update public.job_cancellations set fee = 0 where job_id = pg_temp.id('late') $$, '22023', 'evidence_kept',
  'a cancellation record never changes: evidence_kept');
select lives_ok($$ update public.job_cancellations set actor_id = null where job_id = pg_temp.id('late') $$,
  '…except the account id, set to null when that account is deleted');

-- The terms the customer booked under count, not the mover's later ones.
update public.mover_companies set cancel_free_hours = 168, cancel_late_pct = 100 where id = pg_temp.id('A1');
select is(pg_temp.cancel('terms', 'C1', 5000), 2500, 'the mover changed their terms to 7 days and 100 %: the booked 48 hours and 50 % still apply');
select is((select cancel_free_hours || '/' || cancel_late_pct || ' ' || fee from public.job_cancellations where job_id = pg_temp.id('terms')), '48/50 2500',
  '…and are recorded (a fee below what the customer accepted is the one that counts)');
update public.mover_companies set cancel_free_hours = 48, cancel_late_pct = 50 where id = pg_temp.id('A1');

-- At the pickup, before loading (the move in 5 hours; the mover there early).
do $$
begin
  perform pg_temp.step('at_pickup', 'M1', 'EN_ROUTE_TO_PICKUP');
  perform pg_temp.step('at_pickup', 'M1', 'AT_PICKUP');
end;
$$;
select throws_ok($$ select pg_temp.mover_cancel('at_pickup', 'M1', 'customer_absent') $$, '22023', 'reason_too_early',
  '"Customer not there" only from 15 minutes after the arrival time: reason_too_early');
select is((pg_temp.detail($$ select pg_temp.mover_cancel('at_pickup', 'M1', 'customer_absent') $$) ->> 'from')::timestamptz,
  (select scheduled_at + interval '15 minutes' from public.jobs where id = pg_temp.id('at_pickup')),
  '…saying from when: the arrival time + 15 minutes, for a mover there early');
select is(pg_temp.try($$ select pg_temp.mover_cancel('at_pickup', 'M1', 'cannot_do') $$), 'ok',
  '…while the mover can cancel there at once with any other reason (COMPLIANCE §2: a free way out before loading)');
select is(pg_temp.try($$ select pg_temp.mover_cancel('at_pickup', 'M1', null) $$), 'ok', '…or with none');
select is(pg_temp.cancel('at_pickup', 'C1', 2500), 2500, 'at the pickup, before loading, the customer cancels with the late fee');
select is((select status_before || ' ' || fee_rule from public.job_cancellations where job_id = pg_temp.id('at_pickup')), 'AT_PICKUP late', '…recorded at the pickup');

-- The mover late: 61 minutes after the arrival time, still on the way.
do $$ begin perform pg_temp.step('mover_late', 'M1', 'EN_ROUTE_TO_PICKUP'); end; $$;
select pg_temp.reschedule('mover_late', now() - interval '61 minutes');
select is(pg_temp.cancel('mover_late', 'C1', 0), 0, 'the mover still on the way 61 minutes after the arrival time: cancelling is free');
select is((select status_before || ' ' || fee || ' ' || fee_rule from public.job_cancellations where job_id = pg_temp.id('mover_late')),
  'EN_ROUTE_TO_PICKUP 0 mover_late', '…recorded as the mover''s lateness');

-- Arrived: a pickup photo shows it — one added 30 minutes after the arrival time, or the first only after 61.
do $$
begin
  perform pg_temp.step('photo_in_time', 'M1', 'EN_ROUTE_TO_PICKUP');
  perform pg_temp.step('photo_in_time', 'M1', 'AT_PICKUP');
  perform pg_temp.step('photo_after', 'M1', 'EN_ROUTE_TO_PICKUP');
  perform pg_temp.step('photo_after', 'M1', 'AT_PICKUP');
end;
$$;
set local role authenticated;
select pg_temp.as_user('M1');
select pg_temp.upload('photo_in_time', 'pickup', 'e1e2e3e4.jpg');
select pg_temp.add_photo('photo_in_time', 'pickup', 'e1e2e3e4.jpg');
select pg_temp.upload('photo_after', 'pickup', 'f1f2f3f4.jpg');
select pg_temp.add_photo('photo_after', 'pickup', 'f1f2f3f4.jpg');
reset role;
select pg_temp.as_user(null);
select pg_temp.reschedule('photo_in_time', now() - interval '2 hours');
select pg_temp.back_date_photos('photo_in_time', now() - interval '90 minutes');
select pg_temp.reschedule('photo_after', now() - interval '61 minutes');
select is(pg_temp.cancel('photo_in_time', 'C1', 2500), 2500,
  'two hours after the arrival time, with a pickup photo from 30 minutes after it: the late fee');
select is(pg_temp.cancel('photo_after', 'C1', 0), 0, 'the first pickup photo only 61 minutes after the arrival time: free');
select is(
  (select string_agg(x.status_before || ' ' || x.fee_rule, ', ' order by x.fee_rule) from public.job_cancellations x
   where x.job_id in (pg_temp.id('photo_in_time'), pg_temp.id('photo_after'))),
  'AT_PICKUP late, AT_PICKUP mover_late', '…recorded with their rules');
set local role authenticated;
select pg_temp.as_user('M1');
select is(pg_temp.photos_seen('photo_in_time'), '1 rows, 1 files', 'after a cancellation the mover still reads the move''s photos (their evidence)…');
select pg_temp.as_user('C1');
select is(pg_temp.photos_seen('photo_in_time'), '1 rows, 1 files', '…and so does the customer');
reset role;
select pg_temp.as_user(null);

-- 7. The mover cancels before loading: free, for good, never counted (COMPLIANCE §2, §3) ------------

create temporary table quotable_before on commit drop as
  select * from public.quotable_vehicles('SRID=4326;POINT(21.1655 42.6629)', 'XK', 'XK', 'VAN', true, now() + interval '3 days')
  where company_id = pg_temp.id('A1');
select throws_ok($$ select pg_temp.mover_cancel('mover_cancel', 'M2', null) $$, 'P0002', 'not_found', 'only the mover who accepted the move cancels it');
select throws_ok($$ select pg_temp.mover_cancel('mover_cancel', 'M1', 'too_far') $$, '22023', 'invalid_reason',
  'a reason is one of the fixed choices (no free text)');
select is(pg_temp.mover_cancel('mover_cancel', 'M1', 'cannot_do'), 'CANCELLED', 'the mover cancels before loading, with a reason');
select is((select j.status || ' ' || o.status from public.jobs j join public.job_offers o on o.job_id = j.id where j.id = pg_temp.id('mover_cancel')),
  'CANCELLED accepted', '…the move is cancelled for good (the offer stays accepted)');
select is(
  (select cancelled_by || ' ' || (actor_id = pg_temp.id('M1')) || ' ' || status_before || ' ' || reason || ' ' || fee || ' ' || fee_rule || ' '
       || (free_until = scheduled_at - interval '48 hours')
   from public.job_cancellations where job_id = pg_temp.id('mover_cancel')),
  'mover true ACCEPTED cannot_do 0 mover_cancelled true', '…recorded: nobody pays anything');
select is((select count(*) || ' ' || min(actor_role) from public.job_events where job_id = pg_temp.id('mover_cancel') and event = 'cancelled'),
  '1 mover', '…and logged once, by the mover');
select is(pg_temp.mover_cancel('mover_cancel', 'M1', null), 'CANCELLED', 'cancelling again answers the same (a retry)…');
select is((select count(*)::int from public.job_cancellations where job_id = pg_temp.id('mover_cancel')), 1, '…recorded once');
select throws_ok($$ select pg_temp.cancel('mover_cancel', 'C1', 0) $$, '22023', 'not_cancellable', 'the customer doesn''t cancel what the mover cancelled');
select throws_ok($$ select public.job_book(pg_temp.id('mover_cancel'), pg_temp.id('C1'), true, '+38344123456') $$, '22023', 'not_bookable',
  'nobody is assigned instead: the move isn''t booked again (the customer books another mover as a new request)');
select is(
  (select count(*) filter (where status = 'offered') || ' open, ' || count(*) || ' in all' from public.job_offers where job_id = pg_temp.id('mover_cancel')),
  '0 open, 1 in all', '…and offered to nobody else (COMPLIANCE §2)');
select is((select count(*)::int from public.job_events where job_id = pg_temp.id('mover_cancel') and event = 'offered'), 1, '…no new offer in the log');
select is((select count(*)::int from quotable_before), 1, 'before: the mover''s van is quoted');
select set_eq(
  $$ select * from public.quotable_vehicles('SRID=4326;POINT(21.1655 42.6629)', 'XK', 'XK', 'VAN', true, now() + interval '3 days')
     where company_id = pg_temp.id('A1') $$,
  $$ select * from quotable_before $$,
  'after cancelling, the mover is quoted exactly as before: a cancellation is never counted (COMPLIANCE §2, §3)');

-- Declining, likewise.
select pg_temp.saved('declined', 'C1', 'A1', 'V1', now() + interval '3 days');
insert into notes select 'declined offer', public.job_book(pg_temp.id('declined'), pg_temp.id('C1'), true, '+38344123456');
set local role authenticated;
select pg_temp.as_user('M1');
select is(pg_temp.listed('declined', false), 'OFFERED, exact place hidden', 'an open request: the area only (COMPLIANCE §9.1)…');
select is((select offer_status || ' ' || (last_event_at = now()) from public.my_mover_jobs() where job_id = pg_temp.id('declined')), 'offered true',
  '…with the time of its last step');
reset role;
select pg_temp.as_user(null);
select is(public.job_answer_offer((select v::uuid from notes where k = 'declined offer'), pg_temp.id('M1'), false), 'QUOTED'::public.job_status,
  'the mover declines another request');
select set_eq(
  $$ select * from public.quotable_vehicles('SRID=4326;POINT(21.1655 42.6629)', 'XK', 'XK', 'VAN', true, now() + interval '3 days')
     where company_id = pg_temp.id('A1') $$,
  $$ select * from quotable_before $$,
  'after declining, quoted exactly as before (COMPLIANCE §2)');
select lives_ok($$ update public.jobs set status = 'QUOTED' where id = pg_temp.id('declined') $$,
  'a request saved again (as `book` does) keeps its status: allowed');
select is(pg_temp.cancel('declined', 'C1', 0), 0, 'a request no mover accepted is cancelled for free, as before');

-- "Customer not there": only at the pickup, from 15 minutes after the later of the arrival time and arriving.
do $$ begin perform pg_temp.step('absent', 'M1', 'EN_ROUTE_TO_PICKUP'); end; $$;
select throws_ok($$ select pg_temp.mover_cancel('absent', 'M1', 'customer_absent') $$, '22023', 'invalid_reason',
  '"Customer not there" on the way: invalid_reason');
do $$ begin perform pg_temp.step('absent', 'M1', 'AT_PICKUP'); end; $$;
select pg_temp.reschedule('absent', now() - interval '30 minutes');
select throws_ok($$ select pg_temp.mover_cancel('absent', 'M1', 'customer_absent') $$, '22023', 'reason_too_early',
  'arrived just now, half an hour after the arrival time: not yet');
select is((pg_temp.detail($$ select pg_temp.mover_cancel('absent', 'M1', 'customer_absent') $$) ->> 'from')::timestamptz, now() + interval '15 minutes',
  '…from 15 minutes after arriving');
set local role authenticated;
select pg_temp.as_user('M1');
select is((select absent_reason_from from public.my_mover_jobs() where job_id = pg_temp.id('absent')), now() + interval '15 minutes',
  'the mover''s list says the same moment');
reset role;
select pg_temp.as_user(null);
select pg_temp.back_date('absent', 'at_pickup', interval '20 minutes');
select is(pg_temp.mover_cancel('absent', 'M1', 'customer_absent'), 'CANCELLED',
  '20 minutes after arriving: "customer not there" ends the move, free for everyone');
select is((select status_before || ' ' || reason || ' ' || fee || ' ' || fee_rule from public.job_cancellations where job_id = pg_temp.id('absent')),
  'AT_PICKUP customer_absent 0 mover_cancelled', '…recorded with the reason (nothing is charged — COMPLIANCE-TODO §14)');

-- The records' own checks.
select is(pg_temp.try($$ select pg_temp.cancellation_record('customer', 'AT_PICKUP', null, 2500, 'late') $$), 'ok',
  'a cancellation record as the job functions write it passes the table''s checks…');
select is(pg_temp.try($$ select pg_temp.cancellation_record('mover', 'AT_PICKUP', 'customer_absent', 0, 'mover_cancelled') $$), 'ok', '…the mover''s too');
select throws_ok($$ select pg_temp.cancellation_record('mover', 'ACCEPTED', 'cannot_do', 100, 'mover_cancelled') $$, '23514', null,
  'a mover''s cancellation never costs anyone anything');
select throws_ok($$ select pg_temp.cancellation_record('customer', 'ACCEPTED', null, 0, 'mover_cancelled') $$, '23514', null, '…the rule fits who cancelled');
select throws_ok($$ select pg_temp.cancellation_record('customer', 'ACCEPTED', null, 100, 'free_period') $$, '23514', null, '…only the late rule charges');
select throws_ok($$ select pg_temp.cancellation_record('customer', 'ACCEPTED', 'cannot_do', 0, 'free_period') $$, '23514', null, '…reasons are the mover''s');
select throws_ok($$ select pg_temp.cancellation_record('mover', 'EN_ROUTE_TO_PICKUP', 'customer_absent', 0, 'mover_cancelled') $$, '23514', null,
  '…"customer not there" only at the pickup');
select throws_ok($$ select pg_temp.cancellation_record('customer', 'IN_TRANSIT', null, 0, 'free_period') $$, '23514', null, '…and only before loading');

-- 8. What the mover sees once a move ended, or long after its day (COMPLIANCE §9.1) ----------------

set local role authenticated;
select pg_temp.as_user('M1');
select is(pg_temp.listed('late', false), 'not listed', 'a cancelled move leaves the list of open requests and moves');
select is(pg_temp.listed('late', true), 'CANCELLED, exact place hidden', 'with the ended moves: listed, without the exact place');
select is(
  (select cancelled_by || ' ' || coalesce(cancel_reason, '-') || ' ' || cancellation_fee || ' ' || fee_rule || ' ' || (ended_at = now())
   from public.my_mover_jobs(true) where job_id = pg_temp.id('late')),
  'customer - 2500 late true', '…who cancelled, the fee under their terms, the rule and when');
select is(pg_temp.listed('mover_cancel', true), 'CANCELLED, exact place hidden', 'a move the mover cancelled: without the exact place too');
select is(
  (select cancelled_by || ' ' || cancel_reason || ' ' || cancellation_fee || ' ' || fee_rule from public.my_mover_jobs(true) where job_id = pg_temp.id('mover_cancel')),
  'mover cannot_do 0 mover_cancelled', '…with their reason');
select is((select count(*)::int from public.job_cancellations where job_id in (select id from ids)), 9, 'the mover reads their company''s cancellation records');
select pg_temp.as_user('C1');
select is((select count(*)::int from public.job_cancellations where job_id in (select id from ids)), 9, 'the customer reads those of their moves');
select pg_temp.as_user('AD');
select is((select count(*)::int from public.job_cancellations where job_id in (select id from ids)), 9, 'admins read them');
select pg_temp.as_user('M2');
select is((select count(*)::int from public.job_cancellations where job_id in (select id from ids)), 0, 'another mover reads none');
select pg_temp.as_user('C2');
select is((select count(*)::int from public.job_cancellations where job_id in (select id from ids)), 0, 'another customer reads none');
reset role;
select pg_temp.as_user(null);

-- Accepted but never marked: listed with the place until 7 days after its day, then not at all.
select pg_temp.reschedule('old', now() - interval '6 days');
set local role authenticated;
select pg_temp.as_user('M1');
select is(pg_temp.listed('old', false), 'ACCEPTED, exact place shown', 'an accepted move never marked: listed with its place until 7 days after its day');
reset role;
select pg_temp.as_user(null);
select pg_temp.reschedule('old', now() - interval '7 days 1 minute');
set local role authenticated;
select pg_temp.as_user('M1');
select is(pg_temp.listed('old', true), 'not listed', '…then no longer (data minimisation)');
reset role;
select pg_temp.as_user(null);

-- 9. Who reads which part of a move's log (COMPLIANCE §9.1) -----------------------------------------

-- An hour ago: C1 booked M2, who declined. Now: C1 chose M1, who accepted and is on the way.
select pg_temp.saved('window', 'C1', 'A2', 'V2', now() + interval '5 hours');
do $$
declare
  offer uuid := public.job_book(pg_temp.id('window'), pg_temp.id('C1'), true, '+38344123456');
begin
  perform public.job_answer_offer(offer, pg_temp.id('M2'), false);
end;
$$;
update public.quotes set created_at = created_at - interval '1 hour' where job_id = pg_temp.id('window');
update public.job_offers set created_at = created_at - interval '1 hour', answered_at = answered_at - interval '1 hour' where job_id = pg_temp.id('window');
select pg_temp.back_date('window', null, interval '1 hour');
update public.jobs set chosen_mover_company_id = pg_temp.id('A1'), chosen_vehicle_id = pg_temp.id('V1') where id = pg_temp.id('window');
insert into public.quotes (job_id, vehicle_id, mover_company_id, currency, line_items, mover_price, total,
  take_rate_pct, platform_commission, mover_payout, cancel_free_hours, cancel_late_pct, expires_at)
values (pg_temp.id('window'), pg_temp.id('V1'), pg_temp.id('A1'), 'EUR', '[{"kind":"base","amount":5000}]', 5000, 5000,
  20, 1000, 4000, 48, 50, now() + interval '15 minutes');
do $$
declare
  offer uuid := public.job_book(pg_temp.id('window'), pg_temp.id('C1'), true, '+38344123456');
begin
  perform public.job_answer_offer(offer, pg_temp.id('M1'), true);
  perform pg_temp.step('window', 'M1', 'EN_ROUTE_TO_PICKUP');
end;
$$;
set local role authenticated;
select pg_temp.as_user('M2');
select is((select string_agg(event, ',' order by id) from public.job_events where job_id = pg_temp.id('window')), 'booked,offered,declined',
  'a mover who declined reads the move''s log only up to their answer');
select pg_temp.as_user('M1');
select is((select string_agg(event, ',' order by id) from public.job_events where job_id = pg_temp.id('window')),
  'booked,offered,accepted,en_route_to_pickup', 'the mover who accepted reads it from their offer on');
select throws_ok($$ select actor_id from public.job_events $$, '42501', null, 'nobody signed in reads whose account took a step…');
select throws_ok($$ select uploaded_by from public.job_photos $$, '42501', null, '…or added a photo…');
select throws_ok($$ select actor_id from public.job_cancellations $$, '42501', null, '…or cancelled');
select throws_ok($$ select * from public.job_events $$, '42501', null, '…so clients name the columns they read');
select pg_temp.as_user('C1');
select is((select string_agg(event, ',' order by id) from public.job_events where job_id = pg_temp.id('window')),
  'booked,offered,declined,booked,offered,accepted,en_route_to_pickup', 'the customer reads all of it');
reset role;
select pg_temp.as_user(null);

-- 10. Records: an accepted move stays until it is erased on purpose --------------------------------

select throws_ok($$ delete from public.jobs where id = pg_temp.id('day') $$, '22023', 'job_kept',
  'an accepted move is a record: deleting it along the way is refused (job_kept)');
select lives_ok($$ delete from public.jobs where id = pg_temp.id('declined') $$,
  'a move no mover accepted is still deleted freely (as accounts delete such requests)');
set constraints all immediate;
select throws_ok($$ delete from public.quotes where mover_company_id = pg_temp.id('A1') $$, '23503', null,
  'the accepted mover''s prices can''t go while photos and cancellation records point to them');
set constraints all deferred;
select throws_ok($$ delete from auth.users where id = pg_temp.id('C1') $$, '22023', 'job_kept',
  'deleting the customer''s login doesn''t take their accepted moves with it');
select is(public.erase_jobs(array(select id from public.jobs where customer_id = pg_temp.id('C1'))), 12,
  'erasing on purpose (retention, an erasure request — the service role) deletes them');
select is(
  'photos ' || (select count(*) from public.job_photos where job_id in (select id from ids))
  || ', cancellations ' || (select count(*) from public.job_cancellations where job_id in (select id from ids))
  || ', events ' || (select count(*) from public.job_events where job_id in (select id from ids)),
  'photos 1, cancellations 0, events 5', '…with their photos, cancellation records and log (C2''s move stays)');
select throws_ok($$ delete from public.jobs where id = pg_temp.id('other_mover') $$, '22023', 'job_kept',
  'erasing leaves no door open: other accepted moves are still kept');
select lives_ok($$ delete from auth.users where id = pg_temp.id('C1') $$, 'then the customer''s login goes');
select lives_ok($$ set constraints all immediate $$, '…and nothing deleted is still pointed to');

select * from finish();
rollback;
