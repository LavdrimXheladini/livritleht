-- Customer booking, step 3 (design/DECISIONS.md #26): the booking request, saved on the server.
--
-- 1. Each mover sets their own cancellation terms (owner decision 2026-10-15), from fixed choices so
--    customers can compare them: free cancellation until 1, 2, 3 or 7 days before the arrival time,
--    and what a later cancellation costs — nothing, 25 %, 50 % or 100 % of the mover's price. Set in
--    the app (mover side); a mover without terms is not quoted (customers must see them before
--    booking, COMPLIANCE §8). Test movers get terms here.
-- 2. `jobs` and `quotes` (CLAUDE.md §3): the `book` function prices the chosen mover's van again on the
--    server and saves the move (status QUOTED) with that quote (valid 15 minutes, the terms copied
--    into it). Customers read their own; only the server writes. Nothing goes to movers yet: a job
--    becomes BOOKED with the saved card (Stripe, later), then it is offered (build step 5).

-- 1. Cancellation terms ---------------------------------------------------------------------------

alter table public.mover_companies
  add column cancel_free_hours integer check (cancel_free_hours in (24, 48, 72, 168)),
  add column cancel_late_pct integer check (cancel_late_pct in (0, 25, 50, 100)),
  add constraint mover_companies_cancel_terms_complete check ((cancel_free_hours is null) = (cancel_late_pct is null));

grant update (cancel_free_hours, cancel_late_pct) on public.mover_companies to authenticated;

update public.mover_companies set cancel_free_hours = 24, cancel_late_pct = 50 where is_test;

drop function public.quotable_vehicles(extensions.geography, text, text, public.vehicle_class, boolean, timestamptz);

create function public.quotable_vehicles(
  p_pickup           extensions.geography,
  p_pickup_country   text,
  p_dropoff_country  text,
  p_class            public.vehicle_class,
  p_include_test     boolean default false,
  p_scheduled_at     timestamptz default now()
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
  long_distance_per_km        integer,
  is_business                 boolean,
  registration_no             text,
  town                        text,
  insurance_until             timestamptz,
  cancel_free_hours           integer,
  cancel_late_pct             integer
)
language sql
stable
set search_path = ''
as $$
  select
    v.id, c.id, c.legal_name, rc.currency,
    rc.base_fee, rc.per_km, rc.per_labor_minute_1_helper, rc.per_labor_minute_2_helpers,
    rc.per_labor_minute_3_helpers, rc.min_price, rc.floor_without_lift_fee, rc.heavy_item_fee,
    rc.assembly_per_item, rc.long_distance_threshold_km, rc.long_distance_per_km,
    c.is_business,
    -- A business's registration number is public; a private person has none to show.
    case when c.is_business then c.registration_no end,
    c.address_details ->> 'city',
    (select d.expires_at from public.mover_documents d
     where d.company_id = c.id and d.type = 'insurance' and d.verified_at is not null),
    c.cancel_free_hours,
    c.cancel_late_pct
  from public.vehicles v
  join public.mover_companies c on c.id = v.company_id
  join public.rate_cards rc on rc.vehicle_id = v.id
  -- The move date documents must still be valid on (never earlier than now).
  cross join lateral (select greatest(now(), p_scheduled_at) as move_at) as m
  where v.active
    and v.verified_at is not null
    and v.class = p_class
    and c.verification_status = 'verified'
    and c.stripe_onboarding_complete
    and (p_include_test or not c.is_test)
    and rc.confirmed_by_mover_at is not null
    -- Customers see the mover's cancellation terms before booking (COMPLIANCE §8).
    and c.cancel_free_hours is not null
    -- Registered where the job happens (cabotage, 20261012110000).
    and (
      (p_pickup_country = p_dropoff_country and c.country = p_pickup_country)
      or (p_pickup_country <> p_dropoff_country and c.country in (p_pickup_country, p_dropoff_country))
    )
    -- Not suspended or terminated at any time from now until the move (COMPLIANCE §3). Only a
    -- human-reviewed decision counts; a flag alone never does. Restrictions don't remove the mover
    -- from quotes: what each restriction limits is decided case by case (build step 9).
    and not exists (
      select 1 from public.suspensions s
      where s.company_id = c.id
        and s.kind in ('suspension', 'termination')
        and s.reviewed_by is not null
        and s.effective_at <= m.move_at
        and (s.lifted_at is null or s.lifted_at > now())
    )
    and exists (
      select 1 from public.service_areas sa
      where sa.company_id = c.id
        and extensions.st_dwithin(sa.center, p_pickup, sa.radius_km * 1000.0)
    )
    and exists (
      select 1 from public.mover_documents d
      where d.company_id = c.id and d.type = 'insurance' and d.verified_at is not null and d.expires_at > m.move_at
    )
    -- Cross-border: EUR prices, CMR insurance, and tachograph + licence over 2.5 t (COMPLIANCE §5, §11).
    and (
      p_pickup_country = p_dropoff_country
      or (
        rc.currency = 'EUR'
        and exists (
          select 1 from public.mover_documents d
          where d.company_id = c.id and d.type = 'cmr' and d.verified_at is not null and d.expires_at > m.move_at
        )
        and (
          coalesce(v.max_weight_kg, 3501) <= 2500
          or (
            v.tachograph
            and exists (
              select 1 from public.mover_documents d
              where d.company_id = c.id and d.type = 'licence' and d.verified_at is not null
                and (d.expires_at is null or d.expires_at > m.move_at)
            )
          )
        )
      )
    )
$$;

revoke execute on function public.quotable_vehicles(extensions.geography, text, text, public.vehicle_class, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.quotable_vehicles(extensions.geography, text, text, public.vehicle_class, boolean, timestamptz)
  to service_role;

-- 2. Jobs and quotes ------------------------------------------------------------------------------

-- Mirror packages/shared/src/constants.ts (JOB_TYPES, JOB_STATUSES).
create type public.job_type as enum ('ITEM', 'SMALL_MOVE', 'FULL_MOVE', 'CROSS_BORDER');
create type public.job_status as enum (
  'DRAFT', 'QUOTED', 'BOOKED', 'OFFERED', 'ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT',
  'AT_DROPOFF', 'COMPLETED', 'CANCELLED', 'DISPUTED'
);

create table public.jobs (
  id                       uuid primary key default gen_random_uuid(),
  customer_id              uuid not null references public.profiles (id) on delete cascade,
  status                   public.job_status not null default 'QUOTED',
  type                     public.job_type not null,
  vehicle_class            public.vehicle_class not null,
  helpers                  smallint not null check (helpers between 1 and 3),
  scheduled_at             timestamptz not null,
  -- Each stop: the town / neighbourhood (all a mover sees before accepting, COMPLIANCE §9.1) and the
  -- exact place with the customer's directions (only after accepting).
  pickup_area              text not null check (char_length(pickup_area) between 1 and 120),
  pickup_district          text check (char_length(pickup_district) between 1 and 120),
  pickup_country           text not null check (pickup_country ~ '^[A-Z]{2}$'),
  pickup_label             text not null check (char_length(pickup_label) between 1 and 200),
  pickup_street            text check (char_length(pickup_street) between 1 and 200),
  pickup_house_number      text check (char_length(pickup_house_number) between 1 and 20),
  pickup_point             extensions.geography(Point, 4326) not null,
  pickup_details           text not null default '' check (char_length(pickup_details) <= 300),
  pickup_floor             smallint not null check (pickup_floor between 0 and 60),
  pickup_has_lift          boolean not null,
  dropoff_area             text not null check (char_length(dropoff_area) between 1 and 120),
  dropoff_district         text check (char_length(dropoff_district) between 1 and 120),
  dropoff_country          text not null check (dropoff_country ~ '^[A-Z]{2}$'),
  dropoff_label            text not null check (char_length(dropoff_label) between 1 and 200),
  dropoff_street           text check (char_length(dropoff_street) between 1 and 200),
  dropoff_house_number     text check (char_length(dropoff_house_number) between 1 and 20),
  dropoff_point            extensions.geography(Point, 4326) not null,
  dropoff_details          text not null default '' check (char_length(dropoff_details) <= 300),
  dropoff_floor            smallint not null check (dropoff_floor between 0 and 60),
  dropoff_has_lift         boolean not null,
  -- [{ key, qty, assembly }] from the item catalogue (packages/shared/src/items.ts).
  items                    jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  distance_km              numeric(6, 1) not null check (distance_km >= 0),
  est_labor_min            integer not null check (est_labor_min >= 0),
  chosen_mover_company_id  uuid not null references public.mover_companies (id),
  chosen_vehicle_id        uuid not null references public.vehicles (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index jobs_customer_id_idx on public.jobs (customer_id);
create index jobs_chosen_mover_company_id_idx on public.jobs (chosen_mover_company_id);
create trigger jobs_set_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

create table public.quotes (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references public.jobs (id) on delete cascade,
  vehicle_id           uuid not null references public.vehicles (id),
  mover_company_id     uuid not null references public.mover_companies (id),
  currency             public.currency_code not null,
  -- The mover's price, itemised: [{ kind, amount, quantity?, unitAmount? }] (packages/pricing).
  line_items           jsonb not null check (jsonb_typeof(line_items) = 'array'),
  mover_price          integer not null check (mover_price >= 0),
  -- MoversHub's booking fee; null while the amount is not decided (design/DECISIONS.md #6).
  booking_fee          integer check (booking_fee >= 0),
  total                integer not null check (total >= mover_price),
  take_rate_pct        smallint not null check (take_rate_pct between 0 and 100),
  platform_commission  integer not null check (platform_commission >= 0),
  mover_payout         integer not null check (mover_payout >= 0),
  -- The mover's cancellation terms when the customer saw them: these apply to this booking.
  cancel_free_hours    integer not null check (cancel_free_hours in (24, 48, 72, 168)),
  cancel_late_pct      integer not null check (cancel_late_pct in (0, 25, 50, 100)),
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now()
);

create index quotes_job_id_idx on public.quotes (job_id);

alter table public.jobs enable row level security;
alter table public.quotes enable row level security;

revoke all on public.jobs, public.quotes from anon, authenticated;
grant select on public.jobs, public.quotes to authenticated;
grant all on public.jobs, public.quotes to service_role;

create policy "jobs: customers read their own" on public.jobs for select to authenticated
using (customer_id = (select auth.uid()));
create policy "jobs: admins read" on public.jobs for select to authenticated using (public.is_admin());

create policy "quotes: customers read the quotes of their jobs" on public.quotes for select to authenticated
using (exists (select 1 from public.jobs j where j.id = job_id and j.customer_id = (select auth.uid())));
create policy "quotes: admins read" on public.quotes for select to authenticated using (public.is_admin());
