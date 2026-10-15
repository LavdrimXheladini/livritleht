-- Mover setup, step 5: MoversHub checks movers on the website's admin page (design/DECISIONS.md #23,
-- COMPLIANCE §5 "reasonable efforts to verify"). Admins (profiles.role = 'admin', set only by the service
-- role) read every mover's setup and decide on what waits for a check — the company, each document,
-- each van — through the functions below, which refuse to approve an incomplete company, keep a note
-- for the mover when something needs changes, and log every decision (audit_log).
-- Taking an APPROVED mover off the platform is a suspension (COMPLIANCE §3: reasons, notice, appeal) —
-- not done here (build step 9).

-- 1. Who is an admin.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin');
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2. The note the mover reads when MoversHub asks for changes (written only by the functions below;
--    not in movers' column grants). Cleared when the mover changes what it is about.
alter table public.mover_companies
  add column review_note text check (char_length(review_note) <= 1000),
  add column reviewed_at timestamptz;
alter table public.mover_documents add column review_note text check (char_length(review_note) <= 1000);
alter table public.vehicles add column review_note text check (char_length(review_note) <= 1000);

-- 3. Every admin decision (COMPLIANCE §3, §5: who decided what, when, why). Admins read it; nobody
--    writes it from the apps. Retention: audit_log.
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null check (action in ('verify', 'reject')),
  entity      text not null check (entity in ('mover_company', 'mover_document', 'vehicle')),
  entity_id   uuid not null,
  note        text check (char_length(note) <= 1000),
  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy "audit_log: admins read" on public.audit_log for select to authenticated using (public.is_admin());

-- 4. Admins read every mover's setup, and the document files.
create policy "mover_companies: admins read" on public.mover_companies for select to authenticated using (public.is_admin());
create policy "mover_documents: admins read" on public.mover_documents for select to authenticated using (public.is_admin());
create policy "vehicles: admins read" on public.vehicles for select to authenticated using (public.is_admin());
create policy "rate_cards: admins read" on public.rate_cards for select to authenticated using (public.is_admin());
create policy "service_areas: admins read" on public.service_areas for select to authenticated using (public.is_admin());
create policy "company_registry_checks: admins read" on public.company_registry_checks for select to authenticated using (public.is_admin());
create policy "phone_verifications: admins read" on public.phone_verifications for select to authenticated using (public.is_admin());
create policy "mover-documents: admins read the files"
on storage.objects for select to authenticated
using (bucket_id = 'mover-documents' and public.is_admin());

-- 5. A mover who changes something MoversHub asked to change sends it back to the check.
create function public.mover_companies_resubmit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) = old.owner_id
     and old.verification_status = 'rejected'
     and (new.legal_name, new.registration_no, new.tax_id, new.tax_residency_country, new.country, new.is_business,
          new.address, new.address_point::text, new.address_details, new.contact_phone, new.contact_email)
         is distinct from
         (old.legal_name, old.registration_no, old.tax_id, old.tax_residency_country, old.country, old.is_business,
          old.address, old.address_point::text, old.address_details, old.contact_phone, old.contact_email) then
    new.verification_status := 'pending';
    new.review_note := null;
  end if;
  return new;
end;
$$;

create trigger mover_companies_resubmit before update on public.mover_companies
for each row execute function public.mover_companies_resubmit();

create function public.mover_documents_clear_review_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.file_path, new.expires_at) is distinct from (old.file_path, old.expires_at) then
    new.review_note := null;
  end if;
  return new;
end;
$$;

create trigger mover_documents_clear_review_note before update on public.mover_documents
for each row execute function public.mover_documents_clear_review_note();

create function public.vehicles_clear_review_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.class, new.plate, new.max_weight_kg, new.volume_m3, new.has_tail_lift, new.tachograph)
     is distinct from (old.class, old.plate, old.max_weight_kg, old.volume_m3, old.has_tail_lift, old.tachograph) then
    new.review_note := null;
  end if;
  return new;
end;
$$;

create trigger vehicles_clear_review_note before update on public.vehicles
for each row execute function public.vehicles_clear_review_note();

revoke execute on function public.mover_companies_resubmit() from public, anon, authenticated;
revoke execute on function public.mover_documents_clear_review_note() from public, anon, authenticated;
revoke execute on function public.vehicles_clear_review_note() from public, anon, authenticated;

-- 6. The admin's decisions. Only on what waits for a check (an approved company, document or van is
--    changed through a suspension, §3). Rejecting needs a note for the mover.
create function public.admin_review_company(p_company_id uuid, p_verified boolean, p_note text default null)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.mover_companies;
  missing text[] := '{}';
  doc text;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  select * into c from public.mover_companies where id = p_company_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if c.verification_status <> 'pending' then
    raise exception 'not_waiting_for_check' using errcode = '22023', hint = 'An approved company is changed through a suspension.';
  end if;
  if p_verified then
    -- COMPLIANCE §5 "MUST collect before activation".
    if c.tax_id is null then missing := missing || 'tax_id'::text; end if;
    if c.tax_residency_country is null then missing := missing || 'tax_residency_country'::text; end if;
    if c.address is null or c.address_point is null then missing := missing || 'address'::text; end if;
    if c.contact_phone is null then missing := missing || 'contact_phone'::text; end if;
    if c.contact_email is null then missing := missing || 'contact_email'::text; end if;
    if c.self_certification_at is null then missing := missing || 'self_certification'::text; end if;
    if c.is_business and c.country in ('XK', 'MK', 'PL') and c.registration_no is null then
      missing := missing || 'registration_no'::text;
    end if;
    foreach doc in array array[case when c.is_business then 'registration' else 'id' end, 'insurance'] loop
      if not exists (
        select 1 from public.mover_documents d
        where d.company_id = c.id and d.type::text = doc and d.verified_at is not null and (d.expires_at is null or d.expires_at > now())
      ) then
        missing := missing || ('document_' || doc);
      end if;
    end loop;
    if cardinality(missing) > 0 then
      raise exception 'company_incomplete' using errcode = '22023', detail = array_to_string(missing, ',');
    end if;
    update public.mover_companies set verification_status = 'verified', review_note = null, reviewed_at = now() where id = c.id;
  else
    if char_length(coalesce(note, '')) < 3 then
      raise exception 'review_note_required' using errcode = '22023';
    end if;
    update public.mover_companies set verification_status = 'rejected', review_note = note, reviewed_at = now() where id = c.id;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, note)
  values ((select auth.uid()), case when p_verified then 'verify' else 'reject' end, 'mover_company', c.id, note);
  return case when p_verified then 'verified'::public.verification_status else 'rejected'::public.verification_status end;
end;
$$;

create function public.admin_review_document(p_document_id uuid, p_verified boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.mover_documents;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  select * into d from public.mover_documents where id = p_document_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if d.verified_at is not null then
    raise exception 'not_waiting_for_check' using errcode = '22023';
  end if;
  if p_verified then
    if d.expires_at is not null and d.expires_at <= now() then
      raise exception 'document_expired' using errcode = '22023';
    end if;
    update public.mover_documents set verified_at = now(), review_note = null where id = d.id;
  else
    if char_length(coalesce(note, '')) < 3 then
      raise exception 'review_note_required' using errcode = '22023';
    end if;
    update public.mover_documents set review_note = note where id = d.id;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, note)
  values ((select auth.uid()), case when p_verified then 'verify' else 'reject' end, 'mover_document', d.id, note);
end;
$$;

create function public.admin_review_vehicle(p_vehicle_id uuid, p_verified boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vehicles;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  select * into v from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v.verified_at is not null then
    raise exception 'not_waiting_for_check' using errcode = '22023';
  end if;
  if p_verified then
    update public.vehicles set verified_at = now(), review_note = null where id = v.id;
  else
    if char_length(coalesce(note, '')) < 3 then
      raise exception 'review_note_required' using errcode = '22023';
    end if;
    update public.vehicles set review_note = note where id = v.id;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, note)
  values ((select auth.uid()), case when p_verified then 'verify' else 'reject' end, 'vehicle', v.id, note);
end;
$$;

revoke execute on function public.admin_review_company(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_review_document(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_review_vehicle(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_company(uuid, boolean, text) to authenticated;
grant execute on function public.admin_review_document(uuid, boolean, text) to authenticated;
grant execute on function public.admin_review_vehicle(uuid, boolean, text) to authenticated;
