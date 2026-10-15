-- "My moves" (design/DECISIONS.md #28): each quote keeps the mover as the customer saw them before
-- booking — name, business or not, registration number, address, phone, email, insurance end date,
-- cancellation terms (COMPLIANCE §4; the `BookedMover` type in packages/shared). Customers can't read
-- mover_companies (only the owner and admins can), so their saved requests show this copy; it is also
-- the record of whom the contract was with, should anything change later. Written by the `book`
-- function; quotes saved before this have none.

alter table public.quotes
  add column mover jsonb check (mover is null or jsonb_typeof(mover) = 'object');

-- The stops' coordinates as numbers, so the app can open a saved request again ("Continue booking").
-- PostgREST computed fields (`select=pickup_lat,…`): they read only the row the caller may already
-- see (RLS on jobs), as the caller.
create function public.pickup_lat(public.jobs) returns double precision
language sql stable set search_path = '' as $$ select extensions.st_y($1.pickup_point::extensions.geometry) $$;
create function public.pickup_lon(public.jobs) returns double precision
language sql stable set search_path = '' as $$ select extensions.st_x($1.pickup_point::extensions.geometry) $$;
create function public.dropoff_lat(public.jobs) returns double precision
language sql stable set search_path = '' as $$ select extensions.st_y($1.dropoff_point::extensions.geometry) $$;
create function public.dropoff_lon(public.jobs) returns double precision
language sql stable set search_path = '' as $$ select extensions.st_x($1.dropoff_point::extensions.geometry) $$;

revoke execute on function public.pickup_lat(public.jobs), public.pickup_lon(public.jobs),
  public.dropoff_lat(public.jobs), public.dropoff_lon(public.jobs) from public, anon;
grant execute on function public.pickup_lat(public.jobs), public.pickup_lon(public.jobs),
  public.dropoff_lat(public.jobs), public.dropoff_lon(public.jobs) to authenticated, service_role;
