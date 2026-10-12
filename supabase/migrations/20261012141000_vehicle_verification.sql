-- Vehicle verification (COMPLIANCE §5, §11). A vehicle's class, plate, weight and tachograph decide
-- which jobs it may be quoted for (over 2.5 t a cross-border job needs a tachograph + operator
-- licence), so an admin checks them, like the company and its documents. Until then — and again
-- after any change to them — the vehicle is not quoted. Movers can't set `verified_at`: it is not in
-- their column grants (20261012090000_movers.sql), so only the service role / admin tools set it.

alter table public.vehicles add column verified_at timestamptz;

comment on column public.vehicles.verified_at is
  'When an admin checked class, plate, weight and tachograph. NULL = not quoted. Cleared when any of them changes.';

-- The vehicles already on file: those of verified companies count as checked (today these are only
-- the test movers, design/DECISIONS.md #7).
update public.vehicles v
set verified_at = now()
from public.mover_companies c
where c.id = v.company_id and c.verification_status = 'verified';

-- A change to a checked fact sends the vehicle back to verification — whoever makes it, unless the
-- same update records a new check (only the service role / admins can write `verified_at`).
create function public.vehicles_reverify_on_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.class, new.plate, new.max_weight_kg, new.tachograph)
       is distinct from (old.class, old.plate, old.max_weight_kg, old.tachograph)
     and new.verified_at is not distinct from old.verified_at then
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create trigger vehicles_reverify_on_change before update on public.vehicles
for each row execute function public.vehicles_reverify_on_change();

revoke execute on function public.vehicles_reverify_on_change() from public, anon, authenticated;

-- The class must fit the weight (COMPLIANCE §1.1 table): a box van is at most 3.5 t, a truck is
-- heavier. Unknown weight stays allowed (it counts as over 2.5 t for cross-border jobs).
alter table public.vehicles add constraint vehicles_weight_fits_class check (
  max_weight_kg is null
  or case class
       when 'TRUCK' then max_weight_kg > 3500
       when 'BOX' then max_weight_kg <= 3500
       else true
     end
);

-- Quotable vehicles ----------------------------------------------------------
-- Same as 20261012110000_quotable_vehicles_by_country.sql, plus:
--   - only vehicles an admin has verified;
--   - no company with a reviewed suspension or termination in effect between now and the move;
--   - insurance, CMR insurance and operator licence still valid ON THE MOVE DATE, not only today.
-- `p_scheduled_at` = the move date; left out (the landing's "from" prices) = now. A date in the past
-- never counts: documents must be valid now as well.

drop function public.quotable_vehicles(extensions.geography, text, text, public.vehicle_class, boolean);

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
