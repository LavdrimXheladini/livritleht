-- Customer booking, step 2 (design/DECISIONS.md #25): the customer chooses a mover from the offers,
-- so each offer says who the mover is (COMPLIANCE §4: name, registration number, business or not,
-- verified insurance). `quotable_vehicles` returns, besides the rate card:
--   is_business      — customers are told whether the provider is a business (consumer rights)
--   registration_no  — businesses only (public register data; a private person has none to show)
--   town             — the city of the company's address, from the map search (null before it)
--   insurance_until  — end date of the checked carrier insurance (it is valid on the move date: the
--                      rules below already require that)
-- The rules for who is quoted are unchanged (20261012141000_vehicle_verification.sql). The full address
-- and contact are shown to the customer about to book, not in every quote (the quote is public).

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
  insurance_until             timestamptz
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
     where d.company_id = c.id and d.type = 'insurance' and d.verified_at is not null)
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
