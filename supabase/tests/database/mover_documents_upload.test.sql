begin;
select plan(16);

-- Fixtures: two movers, each with a company (written as the service role, like admin tools).
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d401', 'mover-d401@example.com', '{"locale":"pl"}'),
  ('00000000-0000-0000-0000-00000000d402', 'mover-d402@example.com', '{"locale":"pl"}');
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d401', '00000000-0000-0000-0000-00000000d402');
insert into public.mover_companies (id, owner_id, legal_name, country)
values
  ('00000000-0000-0000-0000-0000000af401', '00000000-0000-0000-0000-00000000d401', 'Przeprowadzki Nowak', 'PL'),
  ('00000000-0000-0000-0000-0000000af402', '00000000-0000-0000-0000-00000000d402', 'Transport Kowalski', 'PL');

select is((select public from storage.buckets where id = 'mover-documents'), false, 'the documents bucket is private');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d401","role":"authenticated"}', true);

-- Files: only into the own company's folder, under a document type.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('mover-documents', '00000000-0000-0000-0000-0000000af401/insurance/f1.pdf', '00000000-0000-0000-0000-00000000d401') $$,
  'a mover uploads a file into their company''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('mover-documents', '00000000-0000-0000-0000-0000000af402/insurance/f9.pdf', '00000000-0000-0000-0000-00000000d401') $$,
  '42501', null, 'a mover cannot upload into another company''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('mover-documents', '00000000-0000-0000-0000-0000000af401/holiday/f2.jpg', '00000000-0000-0000-0000-00000000d401') $$,
  '42501', null, 'only document types are folders');

-- Documents: the file must be in the company's folder for that type, uploaded, with a future end date.
select throws_ok(
  $$ insert into public.mover_documents (company_id, type, file_path, expires_at)
     values ('00000000-0000-0000-0000-0000000af401', 'insurance', '00000000-0000-0000-0000-0000000af401/insurance/f1.pdf', null) $$,
  '22023', 'document_expiry_required', 'insurance needs its end date');
select throws_ok(
  $$ insert into public.mover_documents (company_id, type, file_path, expires_at)
     values ('00000000-0000-0000-0000-0000000af401', 'insurance', '00000000-0000-0000-0000-0000000af401/insurance/f1.pdf', now() - interval '1 day') $$,
  '22023', 'document_expired', 'an expired document is refused');
select throws_ok(
  $$ insert into public.mover_documents (company_id, type, file_path, expires_at)
     values ('00000000-0000-0000-0000-0000000af401', 'insurance', '00000000-0000-0000-0000-0000000af401/insurance/never-uploaded.pdf', now() + interval '1 year') $$,
  '22023', 'document_file_missing', 'a document needs its file in storage');
select throws_ok(
  $$ insert into public.mover_documents (company_id, type, file_path, expires_at)
     values ('00000000-0000-0000-0000-0000000af401', 'cmr', '00000000-0000-0000-0000-0000000af401/insurance/f1.pdf', now() + interval '1 year') $$,
  '22023', 'document_path_outside_company', 'a file belongs to one document type');
select lives_ok(
  $$ insert into public.mover_documents (id, company_id, type, file_path, expires_at)
     values ('00000000-0000-0000-0000-0000000dd401', '00000000-0000-0000-0000-0000000af401', 'insurance',
             '00000000-0000-0000-0000-0000000af401/insurance/f1.pdf', now() + interval '1 year') $$,
  'a mover adds their insurance with its file and end date');
select throws_ok(
  $$ insert into public.mover_documents (company_id, type, file_path, expires_at)
     values ('00000000-0000-0000-0000-0000000af401', 'insurance', '00000000-0000-0000-0000-0000000af401/insurance/f1.pdf', now() + interval '2 years') $$,
  '23505', null, 'one current document per type (a new upload replaces it)');

-- The admin verifies it (service role); a new file sends it back to the check.
reset role;
update public.mover_documents set verified_at = now() where id = '00000000-0000-0000-0000-0000000dd401';
insert into storage.objects (bucket_id, name, owner)
values ('mover-documents', '00000000-0000-0000-0000-0000000af401/insurance/f3.pdf', '00000000-0000-0000-0000-00000000d401');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d401","role":"authenticated"}', true);

update public.mover_documents set file_path = '00000000-0000-0000-0000-0000000af401/insurance/f3.pdf', expires_at = now() + interval '2 years'
where id = '00000000-0000-0000-0000-0000000dd401';
select is((select verified_at from public.mover_documents where id = '00000000-0000-0000-0000-0000000dd401'), null,
  'a replaced file is checked again');

-- What each mover sees and may remove.
select is((select count(*)::int from storage.objects where bucket_id = 'mover-documents'), 2, 'a mover sees their company''s files');
select ok(
  (select bool_and(not exists (select 1 from public.mover_documents d where d.file_path = o.name))
   from storage.objects o where o.name like '%/f1.pdf'),
  'the replaced file is no longer used by any document');
select ok(public.owns_document_folder('00000000-0000-0000-0000-0000000af401/insurance/f1.pdf'), 'the owner may remove the replaced file');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d402","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'mover-documents'), 0, 'another mover sees none of those files');
select is((select count(*)::int from public.mover_documents), 0, 'another mover sees none of those documents');

select * from finish();
rollback;
