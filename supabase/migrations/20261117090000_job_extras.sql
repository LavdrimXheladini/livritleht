-- What the customer adds to a move in their own words (owner decision 2026-11-17):
--   * items_note    — things that are in no category ("Other": a piano, a garden table), at most 500
--                     characters. Not priced: the mover reads it with the list of things, before
--                     accepting, to decide whether to take the move.
--   * helpers_asked — more people than movers can price yet (4 or more, typed under "Custom"). The
--                     price is for `helpers` (3); the mover sees what was asked for.
-- Both are the move's facts: frozen with the rest once the move is booked (jobs_keep_booked_facts
-- compares the whole row), written only by the `book` function (service role).

alter table public.jobs
  add column items_note text
    constraint jobs_items_note_valid check (items_note is null or (char_length(items_note) between 1 and 500 and items_note = btrim(items_note))),
  add column helpers_asked smallint
    constraint jobs_helpers_asked_valid check (helpers_asked is null or (helpers_asked between 4 and 99 and helpers = 3));

comment on column public.jobs.items_note is 'Things in no category, in the customer''s words. Not priced; the mover reads it before accepting.';
comment on column public.jobs.helpers_asked is 'More people than movers can price yet (4+), as the customer asked; the price is for helpers (3).';

-- What a mover sees (20261019090000), with the two: like the list of things, from the request on.
drop function public.my_mover_jobs(boolean);

create function public.my_mover_jobs(p_include_ended boolean default false)
returns table (
  offer_id             uuid,
  offer_status         public.offer_status,
  offer_expires_at     timestamptz,
  job_id               uuid,
  status               public.job_status,
  type                 public.job_type,
  vehicle_class        public.vehicle_class,
  helpers              smallint,
  scheduled_at         timestamptz,
  items                jsonb,
  distance_km          numeric,
  est_labor_min        integer,
  pickup_area          text,
  pickup_district      text,
  pickup_country       text,
  pickup_floor         smallint,
  pickup_has_lift      boolean,
  dropoff_area         text,
  dropoff_district     text,
  dropoff_country      text,
  dropoff_floor        smallint,
  dropoff_has_lift     boolean,
  currency             public.currency_code,
  line_items           jsonb,
  mover_price          integer,
  take_rate_pct        smallint,
  platform_commission  integer,
  mover_payout         integer,
  cancel_free_hours    integer,
  cancel_late_pct      integer,
  pickup_label         text,
  pickup_street        text,
  pickup_house_number  text,
  pickup_details       text,
  pickup_lat           double precision,
  pickup_lon           double precision,
  dropoff_label        text,
  dropoff_street       text,
  dropoff_house_number text,
  dropoff_details      text,
  dropoff_lat          double precision,
  dropoff_lon          double precision,
  on_my_way_from       timestamptz,
  last_event_at        timestamptz,
  ended_at             timestamptz,
  cancelled_by         text,
  cancel_reason        text,
  cancellation_fee     integer,
  fee_rule             text,
  confirmed_at         timestamptz,
  absent_reason_from   timestamptz,
  contact_phone        text,
  contact_name         text,
  items_note           text,
  helpers_asked        smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id, o.status, o.expires_at,
    j.id, j.status, j.type, j.vehicle_class, j.helpers, j.scheduled_at, j.items, j.distance_km, j.est_labor_min,
    j.pickup_area, j.pickup_district, j.pickup_country, j.pickup_floor, j.pickup_has_lift,
    j.dropoff_area, j.dropoff_district, j.dropoff_country, j.dropoff_floor, j.dropoff_has_lift,
    q.currency, q.line_items, q.mover_price, q.take_rate_pct, q.platform_commission, q.mover_payout,
    q.cancel_free_hours, q.cancel_late_pct,
    case when s.exact then j.pickup_label end,
    case when s.exact then j.pickup_street end,
    case when s.exact then j.pickup_house_number end,
    case when s.exact then j.pickup_details end,
    case when s.exact then extensions.st_y(j.pickup_point::extensions.geometry) end,
    case when s.exact then extensions.st_x(j.pickup_point::extensions.geometry) end,
    case when s.exact then j.dropoff_label end,
    case when s.exact then j.dropoff_street end,
    case when s.exact then j.dropoff_house_number end,
    case when s.exact then j.dropoff_details end,
    case when s.exact then extensions.st_y(j.dropoff_point::extensions.geometry) end,
    case when s.exact then extensions.st_x(j.dropoff_point::extensions.geometry) end,
    public.on_my_way_from(j.scheduled_at),
    t.last_event_at,
    t.ended_at,
    x.cancelled_by, x.reason, x.fee, x.fee_rule,
    t.confirmed_at,
    case when t.arrived_at is not null then greatest(j.scheduled_at, t.arrived_at) + interval '15 minutes' end,
    case when s.exact and t.ended_at is null then j.contact_phone end,
    case when s.exact and t.ended_at is null then j.contact_name end,
    j.items_note,
    j.helpers_asked
  from public.job_offers o
  join public.mover_companies c on c.id = o.mover_company_id and c.owner_id = (select auth.uid())
  join public.jobs j on j.id = o.job_id
  join public.quotes q on q.id = o.quote_id
  left join public.job_cancellations x on x.job_id = j.id and o.status = 'accepted'
  cross join lateral (
    select
      coalesce((select max(e.created_at) from public.job_events e where e.job_id = j.id and e.created_at >= o.created_at), o.created_at) as last_event_at,
      (select min(e.created_at) from public.job_events e where o.status = 'accepted' and e.job_id = j.id and e.event in ('completed', 'cancelled')) as ended_at,
      (select min(e.created_at) from public.job_events e where o.status = 'accepted' and e.job_id = j.id and e.event = 'confirmed') as confirmed_at,
      (select min(e.created_at) from public.job_events e where o.status = 'accepted' and e.job_id = j.id and e.event = 'at_pickup') as arrived_at
  ) t
  cross join lateral (
    select o.status = 'accepted' and j.status <> 'CANCELLED'
      and ((t.ended_at is null and now() < j.scheduled_at + interval '7 days')
           or (t.ended_at is not null and t.ended_at > now() - interval '7 days')) as exact
  ) s
  where (o.status = 'offered' and o.expires_at > now())
     or (o.status = 'accepted' and (
          (t.ended_at is null and now() < j.scheduled_at + interval '7 days')
          or (p_include_ended and t.ended_at is not null and t.ended_at > now() - interval '7 days')))
  order by j.scheduled_at
$$;

revoke execute on function public.my_mover_jobs(boolean) from public, anon;
grant execute on function public.my_mover_jobs(boolean) to authenticated;
