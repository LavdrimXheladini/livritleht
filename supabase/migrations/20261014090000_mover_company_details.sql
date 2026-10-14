-- The app's "Your company" form (design/DECISIONS.md #19, COMPLIANCE §5). The table, its column grants
-- and its RLS exist since 20261012090000_movers.sql. Added here: rules on writes by the mover, the
-- phone numbers movers confirm with a code, the official registers' answers, and the address as a
-- point on the map.

-- 1. The self-certification ("I offer only legal services and these details are correct", DSA Art. 30)
--    is dated by the server: the first time a mover gives it, it records now(); later saves keep that
--    time. Whatever time the app sends is ignored, so it can't be back- or forward-dated.
create function public.mover_companies_date_self_certification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if tg_op = 'INSERT' then
      new.self_certification_at := case when new.self_certification_at is not null then now() end;
    elsif old.self_certification_at is not null then
      new.self_certification_at := old.self_certification_at;
    elsif new.self_certification_at is not null then
      new.self_certification_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger mover_companies_date_self_certification before insert or update on public.mover_companies
for each row execute function public.mover_companies_date_self_certification();

revoke execute on function public.mover_companies_date_self_certification() from public, anon, authenticated;

-- 2. Switching between business and private individual changes what has to be checked (company extract
--    vs ID, trader status shown to customers — COMPLIANCE §4, §5), so it sends a verified company back
--    to verification like a change to its legal identity.
create or replace function public.mover_companies_reverify_on_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (new.legal_name, new.registration_no, new.tax_id, new.country, new.tax_residency_country, new.is_business)
         is distinct from (old.legal_name, old.registration_no, old.tax_id, old.country, old.tax_residency_country, old.is_business) then
    new.verification_status := 'pending';
  end if;
  return new;
end;
$$;

revoke execute on function public.mover_companies_reverify_on_identity_change() from public, anon, authenticated;

-- 3. Phone numbers a person confirmed with a code (SMS or WhatsApp via Twilio Verify, or a test number),
--    written only by the `phone-verification` function (service role). The company's contact phone must
--    be one of its owner's confirmed numbers. Retention: phone_verifications (deleted with the account).
create table public.phone_verifications (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  phone        text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  channel      text not null check (channel in ('sms', 'whatsapp', 'test')),
  verified_at  timestamptz not null default now(),
  primary key (user_id, phone)
);

comment on table public.phone_verifications is
  'Phone numbers a user confirmed with a code. Written by the phone-verification function only.';

alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from anon, authenticated;
grant select on public.phone_verifications to authenticated;

create policy "phone_verifications: owner reads"
on public.phone_verifications for select to authenticated
using (user_id = (select auth.uid()));

-- 4. What the official registers said about a mover's tax number (VIES, the Polish VAT white list, the
--    Swiss UID register), written by the `company-registry` function (service role) — evidence for the
--    verification (COMPLIANCE §5: "registry lookup"). Kosovo, Albania and North Macedonia have no
--    register API: MoversHub checks those numbers by hand. Retention: company_registry_checks.
create table public.company_registry_checks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  country             text not null check (country ~ '^[A-Z]{2}$'),
  tax_id              text not null check (char_length(tax_id) between 1 and 60),
  register            text not null check (register in ('vies', 'pl-white-list', 'ch-uid')),
  -- match / mismatch: the register's name for the number vs the typed one; valid: the register has
  -- no name to compare (German VAT numbers); not_found; unavailable: the register didn't answer.
  result              text not null check (result in ('match', 'mismatch', 'valid', 'not_found', 'unavailable')),
  typed_name          text not null check (char_length(typed_name) between 1 and 160),
  registered_name     text check (char_length(registered_name) <= 300),
  registered_address  text check (char_length(registered_address) <= 500),
  checked_at          timestamptz not null default now()
);

create index company_registry_checks_user_idx on public.company_registry_checks (user_id, checked_at desc);

comment on table public.company_registry_checks is
  'Official register answers for movers'' tax numbers. Written by the company-registry function only.';

alter table public.company_registry_checks enable row level security;
revoke all on public.company_registry_checks from anon, authenticated;
grant select on public.company_registry_checks to authenticated;

create policy "company_registry_checks: owner reads"
on public.company_registry_checks for select to authenticated
using (user_id = (select auth.uid()));

-- 5. The company address as the map search found it: its parts (street, number, postcode, city,
--    country, lat/lon) and its point. Movers write both with the address text.
alter table public.mover_companies
  add column address_point   extensions.geography(Point, 4326),
  add column address_details jsonb check (address_details is null or jsonb_typeof(address_details) = 'object');

grant insert (address_point, address_details), update (address_point, address_details)
  on public.mover_companies to authenticated;

-- 6. On a mover's save: the contact phone must be one they confirmed with a code, and a new address
--    must come from the map search, in the country of registration. (Service-role writes — admin
--    tools, test data — are not checked here.)
create function public.mover_companies_check_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    return new;
  end if;
  if new.contact_phone is not null
     and (tg_op = 'INSERT' or new.contact_phone is distinct from old.contact_phone)
     and not exists (select 1 from public.phone_verifications v where v.user_id = me and v.phone = new.contact_phone) then
    raise exception 'contact_phone_not_confirmed'
      using errcode = '22023', hint = 'Confirm the number with a code first (phone-verification function).';
  end if;
  if new.address is not null
     and (tg_op = 'INSERT'
          or (new.address, new.address_point::text, new.address_details, new.country)
             is distinct from (old.address, old.address_point::text, old.address_details, old.country))
     and (new.address_point is null
          or new.address_details is null
          or new.address_details ->> 'countryCode' is distinct from new.country) then
    raise exception 'address_not_located'
      using errcode = '22023', hint = 'Choose the address in the map search, in the country of registration.';
  end if;
  return new;
end;
$$;

create trigger mover_companies_check_contact before insert or update on public.mover_companies
for each row execute function public.mover_companies_check_contact();

revoke execute on function public.mover_companies_check_contact() from public, anon, authenticated;
