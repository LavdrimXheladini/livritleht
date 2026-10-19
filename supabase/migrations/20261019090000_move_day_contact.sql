-- The customer's phone for the move day (design/DECISIONS.md #37; COMPLIANCE §9, §9.1), so the mover
-- can reach someone at the door:
--   1. Given when booking — required — with, optionally, who to ask for (someone else may be there:
--      family, a neighbour). Checked for its form only (E.164), no code: it may be someone else's phone.
--   2. The customer may change it until the mover is on the way; from "On my way" on, and once the
--      move is done or cancelled, it stays as it is — for every writer (the frozen-move trigger).
--   3. Only the mover who accepted the move sees it, from acceptance until the move is done or
--      cancelled (my_mover_jobs). Before accepting a mover sees the area only, as before.

-- 1. On the move.
alter table public.jobs
  add column contact_phone text,
  add column contact_name text,
  add constraint jobs_contact_phone_format check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint jobs_contact_name_format
    check (contact_name = btrim(contact_name) and char_length(contact_name) between 1 and 60 and contact_name !~ '[[:cntrl:]]'),
  add constraint jobs_contact_name_with_phone check (contact_name is null or contact_phone is not null);

comment on column public.jobs.contact_phone is
  'The phone for the move day (E.164), given at booking; changeable until the mover is on the way. Seen by the accepted mover only until the move ends.';
comment on column public.jobs.contact_name is
  'Who to ask for on the move day (optional), with contact_phone.';

/** A phone for the move day and who to ask for, as Postgres keeps them (also packages/shared: moveDayContactSchema). */
create function public.move_day_contact_valid(p_phone text, p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_phone ~ '^\+[1-9][0-9]{7,14}$', false)
     and (p_name is null or (p_name = btrim(p_name) and char_length(p_name) between 1 and 60 and p_name !~ '[[:cntrl:]]'))
$$;

-- 2. A booked move keeps its facts (20261017120000) — except its phone for the move day, until the
-- mover is on the way.
create or replace function public.jobs_keep_booked_facts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status not in ('DRAFT', 'QUOTED')
     and (to_jsonb(new) - 'status' - 'updated_at' - 'contact_phone' - 'contact_name')
         is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'contact_phone' - 'contact_name') then
    raise exception 'job_frozen' using errcode = '22023', hint = 'A booked move keeps its day, stops, things and mover.';
  end if;
  if (new.contact_phone, new.contact_name) is distinct from (old.contact_phone, old.contact_name)
     and old.status not in ('DRAFT', 'QUOTED', 'BOOKED', 'OFFERED', 'ACCEPTED') then
    raise exception 'contact_locked' using errcode = '22023', hint = 'The phone for the move day stays as it is once the mover is on the way.';
  end if;
  return new;
end;
$$;

-- 1. Booking takes the phone for the move day (and who to ask for); one given earlier for this move
-- (a booking the mover declined) stays unless a new one is given. Checked last: whatever else is
-- wrong with the booking is said first.
drop function public.job_book(uuid, uuid, boolean);

create function public.job_book(
  p_job_id uuid,
  p_customer_id uuid,
  p_without_card boolean,
  p_contact_phone text default null,
  p_contact_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  q public.quotes;
  test_mover boolean;
  offer uuid;
  v_phone text;
  v_name text;
begin
  select * into j from public.jobs where id = p_job_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if j.status <> 'QUOTED' then
    raise exception 'not_bookable' using errcode = '22023', hint = 'Only a saved request is booked.';
  end if;
  select * into q from public.quotes where job_id = j.id order by created_at desc limit 1;
  if not found or q.mover_company_id <> j.chosen_mover_company_id or q.vehicle_id <> j.chosen_vehicle_id or q.created_at < j.updated_at then
    raise exception 'quote_required' using errcode = '22023', hint = 'Price the move as it is now first.';
  end if;
  if q.expires_at <= now() then
    raise exception 'quote_expired' using errcode = '22023', hint = 'Price it again first.';
  end if;
  select c.is_test into test_mover from public.mover_companies c where c.id = j.chosen_mover_company_id;
  -- COMPLIANCE §6: a booking saves the card (Stripe). Until that exists, only test movers are booked.
  if not p_without_card or not coalesce(test_mover, false) then
    raise exception 'card_required' using errcode = '22023';
  end if;
  if j.scheduled_at <= now() + interval '1 hour' then
    raise exception 'too_late' using errcode = '22023', hint = 'The move starts too soon to be offered to a mover.';
  end if;
  if p_contact_phone is not null then
    v_phone := p_contact_phone;
    v_name := nullif(btrim(p_contact_name), '');
  else
    v_phone := j.contact_phone;
    v_name := j.contact_name;
  end if;
  if v_phone is null then
    raise exception 'contact_required' using errcode = '22023', hint = 'A phone number for the move day is needed.';
  end if;
  if not public.move_day_contact_valid(v_phone, v_name) then
    raise exception 'invalid_contact' using errcode = '22023', hint = 'A phone number with the country code (+…), and a name of at most 60 characters.';
  end if;

  update public.jobs set status = 'BOOKED', contact_phone = v_phone, contact_name = v_name where id = j.id;
  insert into public.job_events (job_id, event, status, actor_id, actor_role) values (j.id, 'booked', 'BOOKED', p_customer_id, 'customer');
  insert into public.job_offers (job_id, quote_id, mover_company_id, expires_at)
  values (j.id, q.id, q.mover_company_id, public.offer_expiry(now(), j.scheduled_at))
  returning id into offer;
  update public.jobs set status = 'OFFERED' where id = j.id;
  insert into public.job_events (job_id, event, status, actor_role) values (j.id, 'offered', 'OFFERED', 'system');
  return offer;
end;
$$;

-- 2. The customer changes the phone for the move day (and who to ask for: none when not given) while
-- the move is booked and the mover isn't on the way yet. The `job-transition` function calls it.
create function public.job_set_contact(p_job_id uuid, p_customer_id uuid, p_phone text, p_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  v_name text := nullif(btrim(p_name), '');
begin
  select * into j from public.jobs where id = p_job_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if j.status not in ('BOOKED', 'OFFERED', 'ACCEPTED') then
    raise exception 'contact_locked' using errcode = '22023', hint = 'The phone for the move day changes only while the move is booked and the mover is not on the way yet.';
  end if;
  if not public.move_day_contact_valid(p_phone, v_name) then
    raise exception 'invalid_contact' using errcode = '22023', hint = 'A phone number with the country code (+…), and a name of at most 60 characters.';
  end if;
  update public.jobs set contact_phone = p_phone, contact_name = v_name where id = j.id;
end;
$$;

-- 3. What a mover sees (20261017130000), and the phone for the move day: only on a move they accepted,
-- from acceptance until it is done or cancelled (COMPLIANCE §9: only what the move needs).
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
  contact_name         text
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
    case when s.exact and t.ended_at is null then j.contact_name end
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

-- Grants: the steps through the `job-transition` function only (service role); my_mover_jobs for the
-- signed-in mover (their own company's offers, above).
revoke execute on function public.move_day_contact_valid(text, text) from public, anon, authenticated;
revoke execute on function public.job_book(uuid, uuid, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.job_set_contact(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.job_book(uuid, uuid, boolean, text, text) to service_role;
grant execute on function public.job_set_contact(uuid, uuid, text, text) to service_role;
revoke execute on function public.my_mover_jobs(boolean) from public, anon;
grant execute on function public.my_mover_jobs(boolean) to authenticated;
