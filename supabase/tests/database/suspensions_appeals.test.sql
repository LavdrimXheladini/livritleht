begin;
select plan(24);

-- Migration 20261016090000 (COMPLIANCE §3): admins decide with written reasons, the mover reads it at
-- once and appeals, an admin decides the appeal; every step logged. Fixtures by the platform.
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000a901', '38344000901', '{"locale":"en"}'),
  ('00000000-0000-0000-0000-00000000d901', '38344000902', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d902', '38344000903', '{"locale":"sq"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a901';
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d901', '00000000-0000-0000-0000-00000000d902');
insert into public.mover_companies (id, owner_id, legal_name, country, verification_status)
values
  ('00000000-0000-0000-0000-0000000aa901', '00000000-0000-0000-0000-00000000d901', 'Suspended Movers', 'XK', 'verified'),
  ('00000000-0000-0000-0000-0000000aa902', '00000000-0000-0000-0000-00000000d902', 'Other Movers', 'XK', 'verified');

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
$$;

set local role authenticated;

-- A mover can't decide anything.
select pg_temp.as_user('00000000-0000-0000-0000-00000000d901');
select throws_ok(
  $$ select public.admin_decide_suspension('00000000-0000-0000-0000-0000000aa902', 'suspension', 'Repeated no-shows at pickups.') $$,
  '42501', 'admins_only', 'only admins decide');

select pg_temp.as_user('00000000-0000-0000-0000-00000000a901');
select throws_ok(
  $$ select public.admin_decide_suspension('00000000-0000-0000-0000-0000000aa901', 'restriction', 'Something to restrict here.') $$,
  '22023', 'kind_not_available', 'no restriction until its meaning is decided');
select throws_ok(
  $$ select public.admin_decide_suspension('00000000-0000-0000-0000-0000000aa901', 'suspension', 'Bad.') $$,
  '22023', 'reason_required', 'a written statement of reasons (COMPLIANCE §3)');
select throws_ok(
  $$ select public.admin_decide_suspension('00000000-0000-0000-0000-0000000aa901', 'termination', 'Repeated serious complaints.', false, now() + interval '10 days') $$,
  '22023', 'notice_too_short', 'ending an account takes 30 days'' notice');

create temporary table decided (id uuid) on commit drop;
grant all on decided to authenticated;
insert into decided select public.admin_decide_suspension('00000000-0000-0000-0000-0000000aa901', 'suspension', 'Three customers reported damaged furniture this month.');
select is(
  (select flagged_by || ':' || (reviewed_by = '00000000-0000-0000-0000-00000000a901') || ':' || (notice_sent_at is not null) || ':' || (effective_at <= now())
   from public.suspensions where id = (select id from decided)),
  'admin:true:true:true', 'reviewed by the admin, the mover told now, in effect now');
select is((select count(*)::int from public.audit_log where entity = 'suspension' and action = 'suspend' and entity_id = (select id from decided)), 1,
  'the decision is logged');

-- The mover reads it; another mover doesn't.
select pg_temp.as_user('00000000-0000-0000-0000-00000000d901');
select is((select reason_text from public.suspensions where id = (select id from decided)), 'Three customers reported damaged furniture this month.',
  'the mover reads the reasons');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d902');
select is((select count(*)::int from public.suspensions), 0, 'another mover sees nothing');

-- The appeal.
select pg_temp.as_user('00000000-0000-0000-0000-00000000d901');
select lives_ok(
  $$ insert into public.mover_appeals (company_id, suspension_id, subject, text)
     values ('00000000-0000-0000-0000-0000000aa901', (select id from decided), 'other', 'The damage happened before pickup; photos attached.') $$,
  'the mover appeals');
select is((select subject::text || ':' || status::text from public.mover_appeals), 'suspension:open', 'about the suspension, open');
select throws_ok(
  $$ insert into public.mover_appeals (company_id, suspension_id, subject, text)
     values ('00000000-0000-0000-0000-0000000aa901', (select id from decided), 'suspension', 'A second appeal at the same time.') $$,
  '23505', null, 'one appeal at a time per decision');
select throws_ok(
  $$ update public.mover_appeals set status = 'upheld' $$,
  '42501', null, 'the mover can''t decide their own appeal');
-- A complaint about anything else (no decision); an appeal about a decision names it; 3 waiting at most.
select lives_ok(
  $$ insert into public.mover_appeals (company_id, subject, text)
     values ('00000000-0000-0000-0000-0000000aa901', 'other', 'The app showed me a job twice.') $$,
  'a complaint about something else');
select throws_ok(
  $$ insert into public.mover_appeals (company_id, subject, text)
     values ('00000000-0000-0000-0000-0000000aa901', 'termination', 'Appealing without saying which decision.') $$,
  '22023', 'not_appealable', 'an appeal about a decision names the decision');
insert into public.mover_appeals (company_id, subject, text)
values ('00000000-0000-0000-0000-0000000aa901', 'other', 'A second complaint, still waiting.');
select throws_ok(
  $$ insert into public.mover_appeals (company_id, subject, text)
     values ('00000000-0000-0000-0000-0000000aa901', 'other', 'A fourth one while three wait.') $$,
  '22023', 'too_many_open', 'at most three waiting at a time');
select pg_temp.as_user('00000000-0000-0000-0000-00000000d902');
select throws_ok(
  $$ insert into public.mover_appeals (company_id, subject, text)
     values ('00000000-0000-0000-0000-0000000aa901', 'other', 'Appealing for another company.') $$,
  '42501', null, 'nobody appeals for someone else''s company');

-- The admin decides: upheld lifts the decision; the mover reads why.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a901');
select is((select count(*)::int from public.mover_appeals), 3, 'admins read appeals and complaints');
select throws_ok(
  $$ select public.admin_decide_appeal((select id from public.mover_appeals where suspension_id is not null), true, 'OK.') $$,
  '22023', 'reason_required', 'the decision on an appeal has reasons too');
select is(public.admin_decide_appeal((select id from public.mover_appeals where suspension_id is not null), true, 'The pickup photos show the damage was there before.'),
  'upheld'::public.appeal_status, 'the appeal is upheld');
select isnt((select lifted_at from public.suspensions where id = (select id from decided)), null, '…and the suspension lifted');
select throws_ok(
  $$ select public.admin_decide_appeal((select id from public.mover_appeals where suspension_id is not null), false, 'Changing my mind later.') $$,
  '22023', 'already_decided', 'a decided appeal stays decided');

select pg_temp.as_user('00000000-0000-0000-0000-00000000d901');
select is((select decision_reason from public.mover_appeals where suspension_id is not null), 'The pickup photos show the damage was there before.', 'the mover reads the decision');
select throws_ok(
  $$ insert into public.mover_appeals (company_id, suspension_id, subject, text)
     values ('00000000-0000-0000-0000-0000000aa901', (select id from decided), 'suspension', 'Appealing a lifted decision.') $$,
  '22023', 'not_appealable', 'a lifted decision is not appealed');

-- Ending an account without a serious violation: 30 days after the notice by default.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a901');
delete from decided;
insert into decided select public.admin_decide_suspension('00000000-0000-0000-0000-0000000aa902', 'termination', 'Repeated late cancellations over three months.');
select is(
  (select (effective_at - notice_sent_at) = interval '30 days' from public.suspensions where id = (select id from decided)),
  true, 'ending an account: effective 30 days after the notice');

select * from finish();
rollback;
