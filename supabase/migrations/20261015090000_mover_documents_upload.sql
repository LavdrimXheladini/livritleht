-- Mover setup, step 2: documents (design/DECISIONS.md #20, COMPLIANCE §5, §9). The table exists since
-- 20261012090000_movers.sql (owner-only RLS, movers can't set verified_at, a new file or end date
-- clears it). Added here: the private storage bucket for the files, who may touch which file, one
-- current document per type, and the rules on a mover's upload.

-- 1. Private bucket: PDFs and photos up to 10 MB (packages/shared: MAX_DOCUMENT_BYTES,
--    DOCUMENT_MIME_TYPES). Supabase Storage encrypts files at rest (COMPLIANCE §9: "Encrypt ID documents
--    and insurance files at rest"); nothing in it is public — files are read through the API with the
--    owner's session, or by the service role (admin checks).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mover-documents',
  'mover-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A file's path is `<company id>/<document type>/<file>`: true when the signed-in user owns that
-- company and the type is a document type.
create function public.owns_document_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(p_name))[2] in ('registration', 'id', 'insurance', 'cmr', 'licence')
     and exists (
       select 1 from public.mover_companies c
       where c.id::text = (storage.foldername(p_name))[1] and c.owner_id = (select auth.uid())
     );
$$;

revoke execute on function public.owns_document_folder(text) from public, anon;
grant execute on function public.owns_document_folder(text) to authenticated;

create policy "mover-documents: the company's owner reads its files"
on storage.objects for select to authenticated
using (bucket_id = 'mover-documents' and public.owns_document_folder(name));

create policy "mover-documents: the company's owner adds files"
on storage.objects for insert to authenticated
with check (bucket_id = 'mover-documents' and public.owns_document_folder(name));

-- Only files no document points to any more (a replaced one): a current or verified document's file
-- can't be removed from under it. No updates: a new file always gets a new name.
create policy "mover-documents: the company's owner removes replaced files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'mover-documents'
  and public.owns_document_folder(name)
  and not exists (select 1 from public.mover_documents d where d.file_path = storage.objects.name)
);

-- 2. One current document per type: a new upload replaces the file and end date of the row (the
--    existing trigger then clears verified_at, so it is checked again).
alter table public.mover_documents add constraint mover_documents_one_per_type unique (company_id, type);

-- 3. On a mover's upload: the file is in the company's folder for that type and really in storage,
--    documents that end have an end date, and it isn't past. (Service-role writes — admin tools, test
--    data — are not checked here.)
create function public.mover_documents_check_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.file_path, new.expires_at) is not distinct from (old.file_path, old.expires_at) then
    return new;
  end if;
  if new.file_path not like new.company_id::text || '/' || new.type::text || '/%' then
    raise exception 'document_path_outside_company' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'mover-documents' and o.name = new.file_path) then
    raise exception 'document_file_missing' using errcode = '22023';
  end if;
  if new.type <> 'registration' and new.expires_at is null then
    raise exception 'document_expiry_required' using errcode = '22023';
  end if;
  if new.expires_at is not null and new.expires_at <= now() then
    raise exception 'document_expired' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger mover_documents_check_upload before insert or update on public.mover_documents
for each row execute function public.mover_documents_check_upload();

revoke execute on function public.mover_documents_check_upload() from public, anon, authenticated;
