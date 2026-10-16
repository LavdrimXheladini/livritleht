-- Job offers: a booked move goes to the mover the customer chose, who accepts or declines it freely
-- (COMPLIANCE §2, §9.1; design/DECISIONS.md #35).
--
-- Booking (the card saved — Stripe; until then a test booking without a card, with test movers only)
-- sends the move to the chosen mover as an offer: BOOKED → OFFERED. The mover sees the area of each
-- stop, the day, the work and their own price — never the exact address — until they accept
-- (ACCEPTED). Declining costs nothing and changes nothing for them. An offer not answered in time
-- expires: 12 hours after booking, but ending 24 hours before the move when there is time for that
-- (at least an hour). Declined or expired, the move goes back to the customer (QUOTED) to choose
-- another mover: nobody is assigned automatically. The customer can cancel before it is accepted.
-- Every step is a row in job_events (the job's own log, read by both sides). Transitions run only
-- through the `job-transition` edge function (service role), which checks who is asking.

-- 1. Offers.
create type public.offer_status as enum ('offered', 'accepted', 'declined', 'expired', 'cancelled');

create table public.job_offers (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.jobs (id) on delete cascade,
  -- The price the customer booked: the mover's own, from their card.
  quote_id          uuid not null references public.quotes (id) on delete cascade,
  mover_company_id  uuid not null references public.mover_companies (id) on delete cascade,
  status            public.offer_status not null default 'offered',
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  answered_at       timestamptz,
  constraint job_offers_answered check ((status = 'offered') = (answered_at is null))
);

create index job_offers_job_id_idx on public.job_offers (job_id);
create index job_offers_company_idx on public.job_offers (mover_company_id, status);
-- One open offer per move (offered, or accepted and still on).
create unique index job_offers_one_open on public.job_offers (job_id) where status in ('offered', 'accepted');

alter table public.job_offers enable row level security;
revoke all on public.job_offers from anon, authenticated;
grant select on public.job_offers to authenticated;
grant all on public.job_offers to service_role;

create policy "job_offers: customers read the offers of their moves" on public.job_offers for select to authenticated
using (exists (select 1 from public.jobs j where j.id = job_id and j.customer_id = (select auth.uid())));
create policy "job_offers: movers read theirs" on public.job_offers for select to authenticated
using (exists (select 1 from public.mover_companies c where c.id = mover_company_id and c.owner_id = (select auth.uid())));
create policy "job_offers: admins read" on public.job_offers for select to authenticated using (public.is_admin());

-- 2. The job's log: every step, who took it, when.
create table public.job_events (
  id          bigint generated always as identity primary key,
  job_id      uuid not null references public.jobs (id) on delete cascade,
  event       text not null check (event in ('booked', 'offered', 'accepted', 'declined', 'expired', 'cancelled')),
  -- The job's status after the step.
  status      public.job_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_role  text not null check (actor_role in ('customer', 'mover', 'admin', 'system')),
  created_at  timestamptz not null default now()
);

create index job_events_job_id_idx on public.job_events (job_id, created_at);

alter table public.job_events enable row level security;
revoke all on public.job_events from anon, authenticated;
grant select on public.job_events to authenticated;
grant all on public.job_events to service_role;

create policy "job_events: customers read their moves'" on public.job_events for select to authenticated
using (exists (select 1 from public.jobs j where j.id = job_id and j.customer_id = (select auth.uid())));
create policy "job_events: movers read the moves offered to them" on public.job_events for select to authenticated
using (exists (
  select 1 from public.job_offers o join public.mover_companies c on c.id = o.mover_company_id
  where o.job_id = job_events.job_id and c.owner_id = (select auth.uid())
));
create policy "job_events: admins read" on public.job_events for select to authenticated using (public.is_admin());

-- 3. The transitions (service role only: the `job-transition` function passes who is asking).

/** When an offer made at `p_now` for a move at `p_move_at` ends: 12 h, ending 24 h before the move, at least 1 h. */
create function public.offer_expiry(p_now timestamptz, p_move_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select least(p_now + interval '12 hours', greatest(p_now + interval '1 hour', p_move_at - interval '24 hours'))
$$;

/**
 * Books the customer's saved request with the mover they chose and sends it to that mover as an
 * offer. `p_without_card`: a test booking — only with a test mover (until card payments exist, every
 * other booking is refused). The price is the quote the customer saw, still valid.
 */
create function public.job_book(p_job_id uuid, p_customer_id uuid, p_without_card boolean)
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
begin
  select * into j from public.jobs where id = p_job_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if j.status <> 'QUOTED' then
    raise exception 'not_bookable' using errcode = '22023', hint = 'Only a saved request is booked.';
  end if;
  select * into q from public.quotes where job_id = j.id order by created_at desc limit 1;
  if not found or q.mover_company_id <> j.chosen_mover_company_id then
    raise exception 'quote_required' using errcode = '22023';
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

  update public.jobs set status = 'BOOKED' where id = j.id;
  insert into public.job_events (job_id, event, status, actor_id, actor_role) values (j.id, 'booked', 'BOOKED', p_customer_id, 'customer');
  insert into public.job_offers (job_id, quote_id, mover_company_id, expires_at)
  values (j.id, q.id, q.mover_company_id, public.offer_expiry(now(), j.scheduled_at))
  returning id into offer;
  update public.jobs set status = 'OFFERED' where id = j.id;
  insert into public.job_events (job_id, event, status, actor_role) values (j.id, 'offered', 'OFFERED', 'system');
  return offer;
end;
$$;

/**
 * The mover answers an offer: accepted, the move is theirs and they see the exact addresses;
 * declined, it goes back to the customer to choose another mover. Only the company's owner, only an
 * open offer that hasn't expired.
 */
create function public.job_answer_offer(p_offer_id uuid, p_mover_id uuid, p_accept boolean)
returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.job_offers;
  next_status public.job_status := case when p_accept then 'ACCEPTED' else 'QUOTED' end;
begin
  select o2.* into o from public.job_offers o2
  join public.mover_companies c on c.id = o2.mover_company_id
  where o2.id = p_offer_id and c.owner_id = p_mover_id
  for update of o2;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if o.status <> 'offered' then
    raise exception 'already_answered' using errcode = '22023';
  end if;
  if o.expires_at <= now() then
    raise exception 'offer_expired' using errcode = '22023';
  end if;
  perform 1 from public.jobs where id = o.job_id and status = 'OFFERED' for update;
  if not found then
    raise exception 'not_open' using errcode = '22023';
  end if;
  update public.job_offers set status = case when p_accept then 'accepted' else 'declined' end::public.offer_status, answered_at = now()
  where id = o.id;
  update public.jobs set status = next_status where id = o.job_id;
  insert into public.job_events (job_id, event, status, actor_id, actor_role)
  values (o.job_id, case when p_accept then 'accepted' else 'declined' end, next_status, p_mover_id, 'mover');
  return next_status;
end;
$$;

/**
 * The customer cancels a move before a mover has accepted it (later cancelling follows the mover's
 * terms — build step 6). A saved request that was never booked is simply cancelled too.
 */
create function public.job_cancel(p_job_id uuid, p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if j.status not in ('QUOTED', 'BOOKED', 'OFFERED') then
    raise exception 'not_cancellable' using errcode = '22023', hint = 'Once a mover has accepted, their cancellation terms apply.';
  end if;
  update public.job_offers set status = 'cancelled', answered_at = now() where job_id = j.id and status = 'offered';
  update public.jobs set status = 'CANCELLED' where id = j.id;
  insert into public.job_events (job_id, event, status, actor_id, actor_role) values (j.id, 'cancelled', 'CANCELLED', p_customer_id, 'customer');
end;
$$;

/** Ends the offers nobody answered in time; their moves go back to the customers (every 5 minutes). */
create function public.expire_job_offers(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended integer := 0;
  o record;
begin
  for o in
    select id, job_id from public.job_offers where status = 'offered' and expires_at <= p_now for update skip locked
  loop
    update public.job_offers set status = 'expired', answered_at = p_now where id = o.id;
    update public.jobs set status = 'QUOTED' where id = o.job_id and status = 'OFFERED';
    insert into public.job_events (job_id, event, status, actor_role) values (o.job_id, 'expired', 'QUOTED', 'system');
    ended := ended + 1;
  end loop;
  return ended;
end;
$$;

revoke execute on function public.offer_expiry(timestamptz, timestamptz) from public, anon;
revoke execute on function public.job_book(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.job_answer_offer(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.job_cancel(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.expire_job_offers(timestamptz) from public, anon, authenticated;
grant execute on function public.offer_expiry(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.job_book(uuid, uuid, boolean) to service_role;
grant execute on function public.job_answer_offer(uuid, uuid, boolean) to service_role;
grant execute on function public.job_cancel(uuid, uuid) to service_role;
grant execute on function public.expire_job_offers(timestamptz) to service_role;

select cron.schedule('expire-job-offers', '*/5 * * * *', $$select public.expire_job_offers()$$);

-- 4. What a mover sees of the moves offered to them and the ones they accepted (COMPLIANCE §9.1): the
-- area of each stop, floors and lift, the day, the work and their own price — the exact place, the
-- customer's directions and the coordinates only once they accepted.

/** The signed-in mover's open offers and accepted moves, the soonest move first. */
create function public.my_mover_jobs()
returns table (
  offer_id            uuid,
  offer_status        public.offer_status,
  offer_expires_at    timestamptz,
  job_id              uuid,
  status              public.job_status,
  type                public.job_type,
  vehicle_class       public.vehicle_class,
  helpers             smallint,
  scheduled_at        timestamptz,
  items               jsonb,
  distance_km         numeric,
  est_labor_min       integer,
  pickup_area         text,
  pickup_district     text,
  pickup_country      text,
  pickup_floor        smallint,
  pickup_has_lift     boolean,
  dropoff_area        text,
  dropoff_district    text,
  dropoff_country     text,
  dropoff_floor       smallint,
  dropoff_has_lift    boolean,
  currency            public.currency_code,
  line_items          jsonb,
  mover_price         integer,
  take_rate_pct       smallint,
  platform_commission integer,
  mover_payout        integer,
  cancel_free_hours   integer,
  cancel_late_pct     integer,
  -- Only once accepted:
  pickup_label        text,
  pickup_street       text,
  pickup_house_number text,
  pickup_details      text,
  pickup_lat          double precision,
  pickup_lon          double precision,
  dropoff_label       text,
  dropoff_street      text,
  dropoff_house_number text,
  dropoff_details     text,
  dropoff_lat         double precision,
  dropoff_lon         double precision
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
    case when o.status = 'accepted' then j.pickup_label end,
    case when o.status = 'accepted' then j.pickup_street end,
    case when o.status = 'accepted' then j.pickup_house_number end,
    case when o.status = 'accepted' then j.pickup_details end,
    case when o.status = 'accepted' then extensions.st_y(j.pickup_point::extensions.geometry) end,
    case when o.status = 'accepted' then extensions.st_x(j.pickup_point::extensions.geometry) end,
    case when o.status = 'accepted' then j.dropoff_label end,
    case when o.status = 'accepted' then j.dropoff_street end,
    case when o.status = 'accepted' then j.dropoff_house_number end,
    case when o.status = 'accepted' then j.dropoff_details end,
    case when o.status = 'accepted' then extensions.st_y(j.dropoff_point::extensions.geometry) end,
    case when o.status = 'accepted' then extensions.st_x(j.dropoff_point::extensions.geometry) end
  from public.job_offers o
  join public.mover_companies c on c.id = o.mover_company_id and c.owner_id = (select auth.uid())
  join public.jobs j on j.id = o.job_id
  join public.quotes q on q.id = o.quote_id
  where (o.status = 'offered' and o.expires_at > now()) or o.status = 'accepted'
  order by j.scheduled_at
$$;

revoke execute on function public.my_mover_jobs() from public, anon;
grant execute on function public.my_mover_jobs() to authenticated;
