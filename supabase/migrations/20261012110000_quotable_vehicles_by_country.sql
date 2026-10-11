-- Quotable vehicles also depend on where the mover company is REGISTERED (cabotage): a job inside
-- one country goes only to movers registered in that country; a cross-border job only to movers
-- registered in the pickup or the drop-off country (no third-country "cross-trade").
-- COMPLIANCE-TODO: §14 — confirm the cabotage / cross-trade rules per country with the lawyer.
-- The function now takes both countries and works out "cross-border" itself.

drop function public.quotable_vehicles(extensions.geography, public.vehicle_class, boolean, boolean);

create function public.quotable_vehicles(
  p_pickup           extensions.geography,
  p_pickup_country   text,
  p_dropoff_country  text,
  p_class            public.vehicle_class,
  p_include_test     boolean default false
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
    -- Registered where the job happens (see header).
    and (
      (p_pickup_country = p_dropoff_country and c.country = p_pickup_country)
      or (p_pickup_country <> p_dropoff_country and c.country in (p_pickup_country, p_dropoff_country))
    )
    and exists (
      select 1 from public.service_areas sa
      where sa.company_id = c.id
        and extensions.st_dwithin(sa.center, p_pickup, sa.radius_km * 1000.0)
    )
    and exists (
      select 1 from public.mover_documents d
      where d.company_id = c.id and d.type = 'insurance' and d.verified_at is not null and d.expires_at > now()
    )
    -- Cross-border: EUR prices, CMR insurance, and tachograph + licence over 2.5 t (COMPLIANCE §5, §11).
    and (
      p_pickup_country = p_dropoff_country
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

revoke execute on function public.quotable_vehicles(extensions.geography, text, text, public.vehicle_class, boolean)
  from public, anon, authenticated;
grant execute on function public.quotable_vehicles(extensions.geography, text, text, public.vehicle_class, boolean)
  to service_role;
