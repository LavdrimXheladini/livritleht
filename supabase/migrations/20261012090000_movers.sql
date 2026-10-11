-- Movers: companies, documents, vehicles, rate cards, service areas (CLAUDE.md §3, COMPLIANCE §1, §5).
-- Movers are independent businesses: every vehicle carries the mover's OWN rate card; the platform
-- only defines the vehicle classes. Enum values mirror packages/shared/src/constants.ts.
-- Money: integer minor units (cents) + currency.

create extension if not exists postgis with schema extensions;

create type public.vehicle_class as enum ('SMALL', 'VAN', 'LARGE_VAN', 'BOX', 'TRUCK');
create type public.verification_status as enum ('pending', 'verified', 'rejected');
create type public.mover_document_type as enum ('id', 'registration', 'insurance', 'cmr', 'licence');
create type public.currency_code as enum ('EUR', 'PLN', 'CHF', 'ALL', 'MKD', 'RSD');

-- Companies ----------------------------------------------------------------

create table public.mover_companies (
  id                          uuid primary key default gen_random_uuid(),
  -- The mover account that manages the company. Only test companies may have none.
  owner_id                    uuid unique references public.profiles (id) on delete restrict,
  legal_name                  text not null check (char_length(legal_name) between 2 and 160),
  registration_no             text check (char_length(registration_no) <= 60),
  tax_id                      text check (char_length(tax_id) <= 60),
  tax_residency_country       text check (tax_residency_country ~ '^[A-Z]{2}$'),
  address                     text check (char_length(address) <= 300),
  country                     text not null check (country ~ '^[A-Z]{2}$'),
  contact_phone               text check (char_length(contact_phone) <= 32),
  contact_email               text check (char_length(contact_email) <= 254),
  is_business                 boolean not null default true,
  verification_status         public.verification_status not null default 'pending',
  stripe_account_id           text unique,
  stripe_onboarding_complete  boolean not null default false,
  self_certification_at       timestamptz,
  -- Sample movers for development (design/DECISIONS.md #7); never quoted unless test movers are enabled.
  is_test                     boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint mover_companies_owner_or_test check (owner_id is not null or is_test)
);

comment on table public.mover_companies is
  'Independent moving businesses (KYB, COMPLIANCE §5). Verification, Stripe and test flags are set only by the service role.';

-- Documents (files live in a private storage bucket) ------------------------

create table public.mover_documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.mover_companies (id) on delete cascade,
  type         public.mover_document_type not null,
  file_path    text not null check (char_length(file_path) between 1 and 500),
  expires_at   timestamptz,
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index mover_documents_company_type_idx on public.mover_documents (company_id, type);

-- Vehicles -----------------------------------------------------------------

create table public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.mover_companies (id) on delete cascade,
  class          public.vehicle_class not null,
  plate          text not null check (char_length(plate) between 2 and 16),
  -- Maximum permissible (gross) weight. Decides the cross-border rules: ≤ 2.5 t needs no
  -- tachograph or operator licence; heavier vehicles need both (COMPLIANCE §5, §11).
  max_weight_kg  integer check (max_weight_kg > 0),
  volume_m3      numeric(4, 1) check (volume_m3 > 0),
  has_tail_lift  boolean not null default false,
  tachograph     boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, plate)
);

create index vehicles_company_id_idx on public.vehicles (company_id);
create index vehicles_active_class_idx on public.vehicles (class) where active;

-- Rate cards: one per vehicle, set by the mover ------------------------------
-- Labour rates are per minute, by crew size INCLUDING the mover (1 = mover only).
-- NULL for a crew of 2 or 3 = that crew isn't offered with this vehicle.

create table public.rate_cards (
  id                          uuid primary key default gen_random_uuid(),
  vehicle_id                  uuid not null unique references public.vehicles (id) on delete cascade,
  currency                    public.currency_code not null,
  base_fee                    integer not null check (base_fee >= 0),
  per_km                      integer not null check (per_km >= 0),
  per_labor_minute_1_helper   integer not null check (per_labor_minute_1_helper >= 0),
  per_labor_minute_2_helpers  integer check (per_labor_minute_2_helpers >= 0),
  per_labor_minute_3_helpers  integer check (per_labor_minute_3_helpers >= 0),
  min_price                   integer not null default 0 check (min_price >= 0),
  floor_without_lift_fee      integer not null default 0 check (floor_without_lift_fee >= 0),
  heavy_item_fee              integer not null default 0 check (heavy_item_fee >= 0),
  assembly_per_item           integer not null default 0 check (assembly_per_item >= 0),
  long_distance_threshold_km  integer check (long_distance_threshold_km >= 0),
  long_distance_per_km        integer not null default 0 check (long_distance_per_km >= 0),
  -- Set when the mover saves the card. Only confirmed cards are quoted (COMPLIANCE §1.1:
  -- suggested rates may be pre-filled, but never used until the mover reviews and saves them).
  confirmed_by_mover_at       timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.rate_cards is
  'Each mover''s own prices per vehicle (COMPLIANCE §1). No platform price list and no maximum.';

-- Service areas: where a company picks up jobs -------------------------------

create table public.service_areas (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.mover_companies (id) on delete cascade,
  label       text check (char_length(label) <= 120),
  center      extensions.geography(Point, 4326) not null,
  radius_km   integer not null check (radius_km between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index service_areas_company_id_idx on public.service_areas (company_id);
create index service_areas_center_idx on public.service_areas using gist (center);

-- updated_at ---------------------------------------------------------------

create trigger mover_companies_set_updated_at before update on public.mover_companies
for each row execute function public.set_updated_at();
create trigger mover_documents_set_updated_at before update on public.mover_documents
for each row execute function public.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles
for each row execute function public.set_updated_at();
create trigger rate_cards_set_updated_at before update on public.rate_cards
for each row execute function public.set_updated_at();
create trigger service_areas_set_updated_at before update on public.service_areas
for each row execute function public.set_updated_at();

-- Business rules on writes by the mover (auth.uid() set). Writes by the service role
-- (admin tools, pre-filled suggestions, test data) keep the values they were given.

-- A mover saving their rate card confirms it.
create function public.rate_cards_confirm_on_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.confirmed_by_mover_at := now();
  end if;
  return new;
end;
$$;

create trigger rate_cards_confirm_on_save before insert or update on public.rate_cards
for each row execute function public.rate_cards_confirm_on_save();

-- Changing the legal identity of a verified company sends it back to verification (COMPLIANCE §5).
create function public.mover_companies_reverify_on_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (new.legal_name, new.registration_no, new.tax_id, new.country, new.tax_residency_country)
         is distinct from (old.legal_name, old.registration_no, old.tax_id, old.country, old.tax_residency_country) then
    new.verification_status := 'pending';
  end if;
  return new;
end;
$$;

create trigger mover_companies_reverify_on_identity_change before update on public.mover_companies
for each row execute function public.mover_companies_reverify_on_identity_change();

-- A replaced document file or expiry date must be checked again.
create function public.mover_documents_reverify_on_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (new.file_path, new.expires_at) is distinct from (old.file_path, old.expires_at) then
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create trigger mover_documents_reverify_on_change before update on public.mover_documents
for each row execute function public.mover_documents_reverify_on_change();

revoke execute on function public.rate_cards_confirm_on_save() from public, anon, authenticated;
revoke execute on function public.mover_companies_reverify_on_identity_change() from public, anon, authenticated;
revoke execute on function public.mover_documents_reverify_on_change() from public, anon, authenticated;

-- Privileges + RLS: a mover manages only their own company. Customers and visitors read nothing
-- here directly — quotes go through the server (`quote` function, service role).

alter table public.mover_companies enable row level security;
alter table public.mover_documents enable row level security;
alter table public.vehicles enable row level security;
alter table public.rate_cards enable row level security;
alter table public.service_areas enable row level security;

revoke all on public.mover_companies, public.mover_documents, public.vehicles, public.rate_cards, public.service_areas
  from anon, authenticated;

grant select on public.mover_companies, public.mover_documents, public.vehicles, public.rate_cards, public.service_areas
  to authenticated;

grant insert (id, owner_id, legal_name, registration_no, tax_id, tax_residency_country, address, country,
              contact_phone, contact_email, is_business, self_certification_at)
  on public.mover_companies to authenticated;
grant update (legal_name, registration_no, tax_id, tax_residency_country, address, country,
              contact_phone, contact_email, is_business, self_certification_at)
  on public.mover_companies to authenticated;

grant insert (id, company_id, type, file_path, expires_at) on public.mover_documents to authenticated;
grant update (file_path, expires_at) on public.mover_documents to authenticated;

grant insert (id, company_id, class, plate, max_weight_kg, volume_m3, has_tail_lift, tachograph, active)
  on public.vehicles to authenticated;
grant update (class, plate, max_weight_kg, volume_m3, has_tail_lift, tachograph, active)
  on public.vehicles to authenticated;

grant insert (vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, per_labor_minute_2_helpers,
              per_labor_minute_3_helpers, min_price, floor_without_lift_fee, heavy_item_fee, assembly_per_item,
              long_distance_threshold_km, long_distance_per_km)
  on public.rate_cards to authenticated;
grant update (currency, base_fee, per_km, per_labor_minute_1_helper, per_labor_minute_2_helpers,
              per_labor_minute_3_helpers, min_price, floor_without_lift_fee, heavy_item_fee, assembly_per_item,
              long_distance_threshold_km, long_distance_per_km)
  on public.rate_cards to authenticated;

grant insert, update, delete on public.service_areas to authenticated;

-- Companies
create policy "mover_companies: owner reads"
on public.mover_companies for select to authenticated
using (owner_id = (select auth.uid()));

create policy "mover_companies: movers create their own"
on public.mover_companies for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'mover')
);

create policy "mover_companies: owner updates"
on public.mover_companies for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- Everything below belongs to a company; the owner of that company manages it.
create policy "mover_documents: owner reads"
on public.mover_documents for select to authenticated
using (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));

create policy "mover_documents: owner adds"
on public.mover_documents for insert to authenticated
with check (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));

create policy "mover_documents: owner updates"
on public.mover_documents for update to authenticated
using (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())))
with check (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));

create policy "vehicles: owner reads"
on public.vehicles for select to authenticated
using (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));

create policy "vehicles: owner adds"
on public.vehicles for insert to authenticated
with check (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));

create policy "vehicles: owner updates"
on public.vehicles for update to authenticated
using (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())))
with check (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));

create policy "rate_cards: owner reads"
on public.rate_cards for select to authenticated
using (exists (
  select 1 from public.vehicles v join public.mover_companies c on c.id = v.company_id
  where v.id = vehicle_id and c.owner_id = (select auth.uid())
));

create policy "rate_cards: owner adds"
on public.rate_cards for insert to authenticated
with check (exists (
  select 1 from public.vehicles v join public.mover_companies c on c.id = v.company_id
  where v.id = vehicle_id and c.owner_id = (select auth.uid())
));

create policy "rate_cards: owner updates"
on public.rate_cards for update to authenticated
using (exists (
  select 1 from public.vehicles v join public.mover_companies c on c.id = v.company_id
  where v.id = vehicle_id and c.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.vehicles v join public.mover_companies c on c.id = v.company_id
  where v.id = vehicle_id and c.owner_id = (select auth.uid())
));

create policy "service_areas: owner manages"
on public.service_areas for all to authenticated
using (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())))
with check (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));

-- Quotable vehicles ----------------------------------------------------------
-- Vehicles that may be quoted for a pickup point (CLAUDE.md §4): class match, active vehicle,
-- verified company with Stripe ready, rate card confirmed by the mover, pickup inside a service
-- area, valid insurance (COMPLIANCE §5). Cross-border also needs EUR rates and CMR insurance, plus
-- tachograph + operator licence for vehicles over 2.5 t (unknown weight counts as heavy) (§5, §11).
-- Server only (quote function, service role).
-- TODO(build steps 5, 9): availability at the scheduled time; exclude suspended companies.

create function public.quotable_vehicles(
  p_pickup        extensions.geography,
  p_class         public.vehicle_class,
  p_cross_border  boolean,
  p_include_test  boolean default false
)
returns table (
  vehicle_id                  uuid,
  company_id                  uuid,
  company_name                text,
  currency                    public.currency_code,
  base_fee                    integer,
  per_km                      integer,
  per_labor_minute_1_helper   integer,
  per_labor_minute_2_helpers  integer,
  per_labor_minute_3_helpers  integer,
  min_price                   integer,
  floor_without_lift_fee      integer,
  heavy_item_fee              integer,
  assembly_per_item           integer,
  long_distance_threshold_km  integer,
  long_distance_per_km        integer
)
language sql
stable
set search_path = ''
as $$
  select
    v.id, c.id, c.legal_name, rc.currency,
    rc.base_fee, rc.per_km, rc.per_labor_minute_1_helper, rc.per_labor_minute_2_helpers,
    rc.per_labor_minute_3_helpers, rc.min_price, rc.floor_without_lift_fee, rc.heavy_item_fee,
    rc.assembly_per_item, rc.long_distance_threshold_km, rc.long_distance_per_km
  from public.vehicles v
  join public.mover_companies c on c.id = v.company_id
  join public.rate_cards rc on rc.vehicle_id = v.id
  where v.active
    and v.class = p_class
    and c.verification_status = 'verified'
    and c.stripe_onboarding_complete
    and (p_include_test or not c.is_test)
    and rc.confirmed_by_mover_at is not null
    and exists (
      select 1 from public.service_areas sa
      where sa.company_id = c.id
        and extensions.st_dwithin(sa.center, p_pickup, sa.radius_km * 1000.0)
    )
    and exists (
      select 1 from public.mover_documents d
      where d.company_id = c.id and d.type = 'insurance' and d.verified_at is not null and d.expires_at > now()
    )
    and (
      not p_cross_border
      or (
        rc.currency = 'EUR'
        and exists (
          select 1 from public.mover_documents d
          where d.company_id = c.id and d.type = 'cmr' and d.verified_at is not null and d.expires_at > now()
        )
        and (
          coalesce(v.max_weight_kg, 3501) <= 2500
          or (
            v.tachograph
            and exists (
              select 1 from public.mover_documents d
              where d.company_id = c.id and d.type = 'licence' and d.verified_at is not null
                and (d.expires_at is null or d.expires_at > now())
            )
          )
        )
      )
    )
$$;

revoke execute on function public.quotable_vehicles(extensions.geography, public.vehicle_class, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.quotable_vehicles(extensions.geography, public.vehicle_class, boolean, boolean)
  to service_role;
