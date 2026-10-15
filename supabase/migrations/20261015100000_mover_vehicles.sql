-- Mover setup, step 3: vans (design/DECISIONS.md #21, COMPLIANCE §5, §11). The table exists since
-- 20261012090000_movers.sql: owner-only RLS, movers can't set verified_at, and a change to class,
-- plate, weight or tachograph clears it (20261012141000). Added here: only trucks are over 3.5 t, and
-- the rules on a van a mover saves (the app's form: packages/shared/src/schemas/vehicle.ts).

-- 1. Every class but TRUCK is at most 3.5 t (vans driven with a car licence); a truck is heavier.
--    Unknown weight stays allowed for admin tools and test data (it counts as over 2.5 t cross-border).
alter table public.vehicles drop constraint vehicles_weight_fits_class;
alter table public.vehicles add constraint vehicles_weight_fits_class check (
  max_weight_kg is null
  or case class when 'TRUCK' then max_weight_kg > 3500 else max_weight_kg <= 3500 end
);

-- 2. On a mover's save: the plate as written on the vehicle, in capitals (umlauts for German and
--    Austrian district codes); the maximum permissible weight (registration certificate, F.2) and the
--    load volume are required; no tachograph is kept for vans up to 2.5 t (it matters only above, for
--    international jobs).
create function public.vehicles_check_mover_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.plate !~ '^[A-Z0-9ÄÖÜ][A-Z0-9ÄÖÜ -]{1,15}$' then
    raise exception 'vehicle_plate_invalid' using errcode = '22023';
  end if;
  if new.max_weight_kg is null or new.max_weight_kg not between 500 and 44000 then
    raise exception 'vehicle_weight_required' using errcode = '22023';
  end if;
  if new.volume_m3 is null or new.volume_m3 not between 1 and 120 then
    raise exception 'vehicle_volume_required' using errcode = '22023';
  end if;
  if new.max_weight_kg <= 2500 then
    new.tachograph := false;
  end if;
  return new;
end;
$$;

create trigger vehicles_check_mover_save before insert or update on public.vehicles
for each row execute function public.vehicles_check_mover_save();

revoke execute on function public.vehicles_check_mover_save() from public, anon, authenticated;
