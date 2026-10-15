begin;
select plan(22);

-- Fixtures: an admin, a mover with a company waiting for the check, and another mover.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000a601', 'admin-a601@example.com', '{"locale":"en"}'),
  ('00000000-0000-0000-0000-00000000d601', 'mover-d601@example.com', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d602', 'mover-d602@example.com', '{"locale":"sq"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a601';
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d601', '00000000-0000-0000-0000-00000000d602');
insert into public.mover_companies (id, owner_id, is_business, legal_name, registration_no, tax_id, country, tax_residency_country,
  address, address_point, address_details, contact_phone, contact_email, self_certification_at)
values ('00000000-0000-0000-0000-0000000af601', '00000000-0000-0000-0000-00000000d601', true, 'Lëvizje Shpk', '810123456', '601234567',
  'XK', 'XK', 'Rr. Agim Ramadani 12, 10000 Prishtinë', 'SRID=4326;POINT(21.1655 42.6629)', '{"city":"Prishtinë","countryCode":"XK","lat":42.6629,"lon":21.1655}',
  '+38344123456', 'info@levizje.example', now());
insert into storage.objects (bucket_id, name, owner)
values
  ('mover-documents', '00000000-0000-0000-0000-0000000af601/registration/r1.pdf', '00000000-0000-0000-0000-00000000d601'),
  ('mover-documents', '00000000-0000-0000-0000-0000000af601/insurance/i1.pdf', '00000000-0000-0000-0000-00000000d601');
insert into public.mover_documents (id, company_id, type, file_path, expires_at)
values
  ('00000000-0000-0000-0000-0000000dd601', '00000000-0000-0000-0000-0000000af601', 'registration', '00000000-0000-0000-0000-0000000af601/registration/r1.pdf', null),
  ('00000000-0000-0000-0000-0000000dd602', '00000000-0000-0000-0000-0000000af601', 'insurance', '00000000-0000-0000-0000-0000000af601/insurance/i1.pdf', now() + interval '1 year');
insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3)
values ('00000000-0000-0000-0000-0000000be601', '00000000-0000-0000-0000-0000000af601', 'VAN', '01-601 AA', 2800, 6);

set local role authenticated;

-- Not an admin: no decisions, no other movers' data.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d602","role":"authenticated"}', true);
select is(public.is_admin(), false, 'a mover is not an admin');
select throws_ok($$ select public.admin_review_company('00000000-0000-0000-0000-0000000af601', true) $$, '42501', 'admins_only',
  'a mover cannot approve a company');
select throws_ok($$ select public.admin_review_document('00000000-0000-0000-0000-0000000dd601', true) $$, '42501', 'admins_only',
  'a mover cannot approve a document');
select throws_ok($$ select public.admin_review_vehicle('00000000-0000-0000-0000-0000000be601', true) $$, '42501', 'admins_only',
  'a mover cannot approve a van');
select is((select count(*)::int from public.audit_log), 0, 'a mover cannot read the decisions');

-- The admin reads every mover's setup and its files.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a601","role":"authenticated"}', true);
select is(public.is_admin(), true, 'the admin is an admin');
select is((select count(*)::int from public.mover_companies where id = '00000000-0000-0000-0000-0000000af601'), 1, 'the admin reads a mover''s company');
select is((select count(*)::int from public.mover_documents where company_id = '00000000-0000-0000-0000-0000000af601'), 2, '... its documents');
select is((select count(*)::int from storage.objects where name like '00000000-0000-0000-0000-0000000af601/%'), 2, '... and their files');

-- Approving needs everything: here the documents aren't checked yet.
select throws_ok($$ select public.admin_review_company('00000000-0000-0000-0000-0000000af601', true) $$, '22023', 'company_incomplete',
  'a company is not approved while its required documents are unchecked');

-- Asking for changes needs a note; the mover reads it; changing the file clears it.
select throws_ok($$ select public.admin_review_document('00000000-0000-0000-0000-0000000dd602', false, '') $$, '22023', 'review_note_required',
  'asking for changes needs a note for the mover');
select lives_ok($$ select public.admin_review_document('00000000-0000-0000-0000-0000000dd602', false, 'The policy number is not readable.') $$,
  'the admin asks for a new insurance document');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d601","role":"authenticated"}', true);
select is((select review_note from public.mover_documents where id = '00000000-0000-0000-0000-0000000dd602'), 'The policy number is not readable.',
  'the mover reads the note');
select throws_ok($$ update public.mover_documents set review_note = null where id = '00000000-0000-0000-0000-0000000dd602' $$, '42501', null,
  'the mover cannot remove the note themselves');
reset role;
insert into storage.objects (bucket_id, name, owner)
values ('mover-documents', '00000000-0000-0000-0000-0000000af601/insurance/i2.pdf', '00000000-0000-0000-0000-00000000d601');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d601","role":"authenticated"}', true);
update public.mover_documents set file_path = '00000000-0000-0000-0000-0000000af601/insurance/i2.pdf' where id = '00000000-0000-0000-0000-0000000dd602';
select is((select review_note from public.mover_documents where id = '00000000-0000-0000-0000-0000000dd602'), null, 'a new file clears the note');

-- The admin approves the documents, the van and then the company; every decision is logged.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a601","role":"authenticated"}', true);
select public.admin_review_document('00000000-0000-0000-0000-0000000dd601', true);
select public.admin_review_document('00000000-0000-0000-0000-0000000dd602', true);
select public.admin_review_vehicle('00000000-0000-0000-0000-0000000be601', true);
select is(public.admin_review_company('00000000-0000-0000-0000-0000000af601', true)::text, 'verified', 'a complete company is approved');
select is((select count(*)::int from public.audit_log where actor_id = '00000000-0000-0000-0000-00000000a601'), 5, 'every decision is logged with who made it');
select throws_ok($$ select public.admin_review_company('00000000-0000-0000-0000-0000000af601', false, 'Changed my mind') $$, '22023', 'not_waiting_for_check',
  'an approved company is not rejected here (that is a suspension, COMPLIANCE §3)');
select throws_ok($$ select public.admin_review_vehicle('00000000-0000-0000-0000-0000000be601', false, 'Wrong plate') $$, '22023', 'not_waiting_for_check',
  'nor an approved van');

-- A company the admin sends back: the mover's change resubmits it.
reset role;
update public.mover_companies set verification_status = 'pending' where id = '00000000-0000-0000-0000-0000000af601';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a601","role":"authenticated"}', true);
select is(public.admin_review_company('00000000-0000-0000-0000-0000000af601', false, 'The address is a different town than on the extract.')::text,
  'rejected', 'the admin asks the mover to change the company details');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d601","role":"authenticated"}', true);
update public.mover_companies set contact_email = 'hello@levizje.example' where id = '00000000-0000-0000-0000-0000000af601';
select is((select verification_status::text from public.mover_companies where id = '00000000-0000-0000-0000-0000000af601'), 'pending',
  'the mover''s change sends it back to the check');
select is((select review_note from public.mover_companies where id = '00000000-0000-0000-0000-0000000af601'), null, 'and clears the note');

select * from finish();
rollback;
