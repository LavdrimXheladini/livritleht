begin;
select plan(14);

-- Migration 20261015150000: reminders 30/14/3 days before a document ends, and when it has ended
-- (COMPLIANCE §5), once per end date. Fixtures by the platform (service role); "now" is passed in.
insert into auth.users (id, phone, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d701', '48500000701', '{"locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000d702', '48500000702', '{"locale":"pl"}');
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d701', '00000000-0000-0000-0000-00000000d702');

insert into public.mover_companies (id, owner_id, legal_name, country, is_test)
values
  ('00000000-0000-0000-0000-0000000aa701', '00000000-0000-0000-0000-00000000d701', 'Kraków Przeprowadzki', 'PL', false),
  ('00000000-0000-0000-0000-0000000aa702', '00000000-0000-0000-0000-00000000d702', 'Test Only', 'PL', true);

-- On 1 November 2026: insurance ends in 20 days, CMR in 2 days, the licence ended yesterday, the ID in 90 days.
insert into public.mover_documents (id, company_id, type, file_path, expires_at)
values
  ('00000000-0000-0000-0000-0000000dd701', '00000000-0000-0000-0000-0000000aa701', 'insurance', 'aa701/insurance.pdf', '2026-11-21 00:00+00'),
  ('00000000-0000-0000-0000-0000000dd702', '00000000-0000-0000-0000-0000000aa701', 'cmr', 'aa701/cmr.pdf', '2026-11-03 00:00+00'),
  ('00000000-0000-0000-0000-0000000dd703', '00000000-0000-0000-0000-0000000aa701', 'licence', 'aa701/licence.pdf', '2026-10-31 00:00+00'),
  ('00000000-0000-0000-0000-0000000dd704', '00000000-0000-0000-0000-0000000aa701', 'id', 'aa701/id.pdf', '2027-01-30 00:00+00'),
  ('00000000-0000-0000-0000-0000000dd705', '00000000-0000-0000-0000-0000000aa702', 'insurance', 'aa702/insurance.pdf', '2026-11-02 00:00+00');

select is(public.queue_document_reminders('2026-11-01 00:00+00'), 3, 'three documents are due a reminder');
select is(
  (select string_agg(document_type || ':' || kind || ':' || days_before, ',' order by document_type::text)
   from public.mover_reminders where company_id = '00000000-0000-0000-0000-0000000aa701'),
  'cmr:document_ending:3,insurance:document_ending:30,licence:document_ended:0',
  'each gets the reminder of its stage: the nearest of 30, 14, 3 days before, or ended');
select is((select count(*)::int from public.mover_reminders where company_id = '00000000-0000-0000-0000-0000000aa702'), 0, 'test movers get none');
select is(public.queue_document_reminders('2026-11-01 12:00+00'), 0, 'the same day again: nothing new (each reminder once)');
select is(public.queue_document_reminders('2026-11-08 00:00+00'), 2,
  'a week later: the insurance (13 days away) gets its 14-day reminder, and the CMR insurance has ended');
select is(public.queue_document_reminders('2026-11-18 00:00+00'), 1, '…and its 3-day reminder when it gets close');

-- A new CMR insurance (a new end date): the reminders about the old date go.
update public.mover_documents set expires_at = '2027-11-03 00:00+00' where id = '00000000-0000-0000-0000-0000000dd702';
select is(public.queue_document_reminders('2026-11-18 00:00+00'), 0, 'a new end date far away: nothing due');
select is((select count(*)::int from public.mover_reminders where document_id = '00000000-0000-0000-0000-0000000dd702'), 0,
  'the reminders about the replaced end date are gone');

-- The mover reads and marks their own; nobody else sees them.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d701","role":"authenticated"}', true);
select is((select count(*)::int from public.mover_reminders where read_at is null), 4, 'the mover reads their reminders');
select lives_ok(
  $$ update public.mover_reminders set read_at = now() where document_type = 'licence' $$,
  'and marks one read');
select throws_ok(
  $$ update public.mover_reminders set days_before = 30 $$,
  '42501', null, 'but changes nothing else');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d702","role":"authenticated"}', true);
select is((select count(*)::int from public.mover_reminders), 0, 'another mover sees none of them');

reset role;
select set_config('request.jwt.claims', '', true);
select is((select read_at is not null from public.mover_reminders where document_type = 'licence'), true, 'the reminder is marked read');
select is((select count(*)::int from cron.job where jobname = 'queue-document-reminders'), 1, 'the job runs daily (pg_cron)');

select * from finish();
rollback;
