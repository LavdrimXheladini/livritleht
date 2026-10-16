begin;
select plan(31);

-- Migration 20261016100000 (COMPLIANCE §3, §8; P2B Art. 3): admins publish terms as versions, movers
-- are told and new mover terms wait 15 days, people accept the version for their side, and until
-- they do a mover isn't quoted (a customer can't book: the `book` function, tested live).
-- Whatever the project already published is set aside here (all of this is rolled back).
delete from public.terms_acceptances;
delete from public.terms_notices;
delete from public.terms_versions;

insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000a951', '38344000951', '{"locale":"en"}'),
  ('00000000-0000-0000-0000-00000000c951', '38344000952', '{"locale":"en"}'),
  ('00000000-0000-0000-0000-00000000d951', '38344000953', '{"locale":"pt"}'),
  ('00000000-0000-0000-0000-00000000d952', '38344000954', '{"locale":"pt"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a951';
update public.profiles set role = 'customer' where id = '00000000-0000-0000-0000-00000000c951';
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d951', '00000000-0000-0000-0000-00000000d952');

-- A mover with a quotable van in Lisbon, and a second mover.
insert into public.mover_companies (id, owner_id, legal_name, country, verification_status, stripe_onboarding_complete, cancel_free_hours, cancel_late_pct)
values ('00000000-0000-0000-0000-0000000aa951', '00000000-0000-0000-0000-00000000d951', 'Termos Mudanças Lda', 'PT', 'verified', true, 48, 50),
       ('00000000-0000-0000-0000-0000000aa952', '00000000-0000-0000-0000-00000000d952', 'Outra Lda', 'PT', 'verified', true, 48, 50);
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, verified_at)
values ('00000000-0000-0000-0000-0000000bb951', '00000000-0000-0000-0000-0000000aa951', 'VAN', 'TEST-TE-1', 2800, now());
insert into public.rate_cards (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, confirmed_by_mover_at)
values ('00000000-0000-0000-0000-0000000bb951', 'EUR', 2500, 60, 28, now());
insert into public.service_areas (company_id, center, radius_km)
values ('00000000-0000-0000-0000-0000000aa951', 'SRID=4326;POINT(-9.1393 38.7223)', 40);
insert into public.mover_documents (company_id, type, file_path, expires_at, verified_at)
values ('00000000-0000-0000-0000-0000000aa951', 'insurance', 'aa951/insurance.pdf', now() + interval '1 year', now());

create function pg_temp.quoted() returns int language sql as $$
  select count(*)::int from public.quotable_vehicles('SRID=4326;POINT(-9.15 38.71)', 'PT', 'PT', 'VAN')
  where vehicle_id = '00000000-0000-0000-0000-0000000bb951'
$$;
create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
$$;
create temporary table published (audience text, id uuid) on commit drop;
grant all on published to authenticated;

select is((select bool_and(rowsecurity) from pg_tables where schemaname = 'public' and tablename in ('terms_versions', 'terms_acceptances', 'terms_notices')),
  true, 'RLS on the three terms tables');
select is(pg_temp.quoted(), 1, 'before any terms are published there is nothing to accept: the mover is quoted');
select is(public.terms_accepted('00000000-0000-0000-0000-00000000c951', 'customer'), true, '…and nothing for customers either');

set local role authenticated;

-- Publishing: admins only.
select pg_temp.as_user('00000000-0000-0000-0000-00000000d951');
select throws_ok($$ select public.admin_publish_terms('mover', '{"text": {"intro": "x"}}') $$, '42501', 'admins_only', 'a mover can''t publish terms');

select pg_temp.as_user('00000000-0000-0000-0000-00000000a951');
select throws_ok($$ select public.admin_publish_terms('mover', '{"intro": "x"}') $$, '22023', 'content_required', 'the text is required');
insert into published select 'mover-1', public.admin_publish_terms('mover', '{"doc": "mover-terms", "text": {"intro": "Version one."}}');
select is(
  (select version || ':' || document_path || ':' || (effective_at <= now()) || ':' || (published_by = '00000000-0000-0000-0000-00000000a951') || ':' || length(content_sha256)
   from public.terms_versions where id = (select id from published where audience = 'mover-1')),
  '1:/legal/mover-terms:true:true:64', 'the first version for movers applies at once (it changes nothing anyone had), with its text''s fingerprint');
select is((select count(*)::int from public.terms_notices where terms_version_id = (select id from published where audience = 'mover-1') and channel = 'in_app'
  and company_id in ('00000000-0000-0000-0000-0000000aa951', '00000000-0000-0000-0000-0000000aa952')), 2, 'every mover is told in the app');
select is((select count(*)::int from public.terms_notices n join public.mover_companies c on c.id = n.company_id
  where n.terms_version_id = (select id from published where audience = 'mover-1') and c.is_test), 0, 'test movers are not told');
select is((select count(*)::int from public.audit_log where entity = 'terms_version' and action = 'publish' and entity_id = (select id from published where audience = 'mover-1')),
  1, 'publishing is logged');

reset role;
select is(pg_temp.quoted(), 0, 'now the mover is not quoted until they accept');
set local role authenticated;

-- Everyone reads the published terms.
set local role anon;
select is((select count(*)::int from public.terms_versions where audience = 'mover'), 1, 'anyone reads the published terms');
set local role authenticated;

-- Accepting: the version for one's own side, once.
select pg_temp.as_user('00000000-0000-0000-0000-00000000c951');
select throws_ok(format($$ select public.accept_terms(%L) $$, (select id from published where audience = 'mover-1')), '22023', 'wrong_side',
  'a customer doesn''t accept the terms for movers');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d951');
create temporary table accepted (at timestamptz) on commit drop;
grant all on accepted to authenticated;
insert into accepted select public.accept_terms((select id from published where audience = 'mover-1'));
select is(public.accept_terms((select id from published where audience = 'mover-1')), (select at from accepted), 'accepting twice keeps the first acceptance');
select is((select count(*)::int from public.terms_acceptances), 1, 'the mover reads their acceptance');
select is((select count(*)::int from public.terms_notices), 1, '…and their notice');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d952');
select is((select count(*)::int from public.terms_acceptances), 0, 'another mover reads none of it');
select throws_ok($$ insert into public.terms_acceptances (user_id, terms_version_id) select '00000000-0000-0000-0000-00000000d952', id from public.terms_versions $$,
  '42501', null, 'acceptances are written only by accept_terms');

reset role;
select is(pg_temp.quoted(), 1, 'accepted: the mover is quoted again');
set local role authenticated;

-- Changes: what changed, 15 days' notice for movers, one waiting at a time.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a951');
select throws_ok($$ select public.admin_publish_terms('mover', '{"doc": "mover-terms", "text": {"intro": "Version one."}}', 'Nothing.', now() + interval '20 days') $$,
  '22023', 'unchanged', 'the same text again is not a new version');
select throws_ok($$ select public.admin_publish_terms('mover', '{"doc": "mover-terms", "text": {"intro": "Version two."}}', null, now() + interval '20 days') $$,
  '22023', 'summary_required', 'a new version says what changed');
select throws_ok($$ select public.admin_publish_terms('mover', '{"doc": "mover-terms", "text": {"intro": "Version two."}}', 'New fees.', now() + interval '10 days') $$,
  '22023', 'notice_too_short', 'new terms for movers apply at least 15 days after publishing');
insert into published select 'mover-2', public.admin_publish_terms('mover', '{"doc": "mover-terms", "text": {"intro": "Version two."}}', 'New fees.', now() + interval '20 days');
select throws_ok($$ select public.admin_publish_terms('mover', '{"doc": "mover-terms", "text": {"intro": "Version three."}}', 'Again.', now() + interval '30 days') $$,
  '22023', 'upcoming_exists', 'one version waits at a time');
select is((select (public.current_terms('mover')).version), 1, 'until it applies, version 1 is in effect');

reset role;
select is(pg_temp.quoted(), 1, 'the mover stays quoted until the new version applies');
set local role authenticated;

-- Withdrawing: only what doesn't apply yet, with a note.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a951');
select throws_ok(format($$ select public.admin_withdraw_terms(%L, '') $$, (select id from published where audience = 'mover-2')), '22023', 'note_required',
  'withdrawing needs a note');
select throws_ok(format($$ select public.admin_withdraw_terms(%L, 'A mistake.') $$, (select id from published where audience = 'mover-1')), '22023', 'already_in_effect',
  'terms in effect can''t be withdrawn');
select lives_ok(format($$ select public.admin_withdraw_terms(%L, 'Published by mistake.') $$, (select id from published where audience = 'mover-2')),
  'a version that doesn''t apply yet is withdrawn');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d951');
select is((select count(*)::int from public.terms_versions where audience = 'mover'), 1, 'a withdrawn version is no longer shown');

-- Customers: published, then accepted.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a951');
insert into published select 'customer-1', public.admin_publish_terms('customer', '{"doc": "terms", "text": {"intro": "For customers."}}');
reset role;
select is(public.terms_accepted('00000000-0000-0000-0000-00000000c951', 'customer'), false, 'a customer who hasn''t accepted the terms in effect can''t book');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c951');
select isnt(public.accept_terms((select id from published where audience = 'customer-1')), null, 'the customer accepts');
reset role;
select is(public.terms_accepted('00000000-0000-0000-0000-00000000c951', 'customer'), true, '…and may book');

select * from finish();
rollback;
