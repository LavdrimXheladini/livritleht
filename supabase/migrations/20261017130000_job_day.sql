-- The job day (build step 6; design/DECISIONS.md #36; COMPLIANCE §2, §7, §8, §9, §9.1, §12, §13).
--
-- The mover whose offer was accepted marks the steps: on my way (from 6 hours before the arrival
-- time) → at the pickup → loaded, leaving (at least one pickup photo) → at the drop-off → move done
-- (at least one drop-off photo). One step at a time, in order, never back; each is a job_events row.
-- Photos are evidence (§7), not control (§2): at least one at each handover, the mover decides what.
-- Until the things are loaded, the customer cancels under the mover's terms (the fee is shown first
-- and only recorded: nothing is charged before card payments) and the mover cancels for free; either
-- way the move is cancelled for good — nobody else is assigned (§2). The customer can confirm the
-- move is done (the hook for releasing payouts later). Steps, photos and cancellations NEVER feed
-- quotes, ranking, flags, suspensions or any measure of a mover (§2, §3, §9.1) — keep it that way.
--
-- Lock order of every job function: the move's row (jobs) first, then its offers; ownership is
-- checked before any lock. Evidence (events, photos, cancellations) is append-only.

-- 1. Helpers.

/** A text that is a uuid, or null. */
create function public.try_uuid(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

/**
 * Append-only rows: nothing changes, except the one column (tg_argv[0]) an account's deletion may set
 * to null (its foreign key is on delete set null).
 */
create function public.keep_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  nullable text := tg_argv[0];
begin
  if nullable is not null
     and (to_jsonb(new) - nullable) = (to_jsonb(old) - nullable)
     and to_jsonb(new) -> nullable = 'null'::jsonb then
    return new;
  end if;
  raise exception 'evidence_kept' using errcode = '22023';
end;
$$;

-- 2. The status edges, for every writer (the functions below, `book`, the service role).
-- IN_TRANSIT and AT_DROPOFF → CANCELLED exist for MoversHub's own tools later (a breakdown, a
-- mover who disappears); in the app nobody cancels once the things are loaded. COMPLETED → DISPUTED
-- comes with disputes (build step 9).
create function public.job_status_change_allowed(p_from public.job_status, p_to public.job_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or (p_from::text || '>' || p_to::text) = any (array[
    'DRAFT>QUOTED', 'QUOTED>BOOKED', 'BOOKED>OFFERED', 'OFFERED>ACCEPTED', 'OFFERED>QUOTED',
    'ACCEPTED>EN_ROUTE_TO_PICKUP', 'EN_ROUTE_TO_PICKUP>AT_PICKUP', 'AT_PICKUP>IN_TRANSIT',
    'IN_TRANSIT>AT_DROPOFF', 'AT_DROPOFF>COMPLETED',
    'QUOTED>CANCELLED', 'BOOKED>CANCELLED', 'OFFERED>CANCELLED',
    'ACCEPTED>CANCELLED', 'EN_ROUTE_TO_PICKUP>CANCELLED', 'AT_PICKUP>CANCELLED',
    'IN_TRANSIT>CANCELLED', 'AT_DROPOFF>CANCELLED'])
$$;

create function public.jobs_check_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.job_status_change_allowed(old.status, new.status) then
    raise exception 'status_change_not_allowed' using errcode = '22023', detail = old.status::text || ' > ' || new.status::text;
  end if;
  return new;
end;
$$;

create trigger jobs_check_status_change before update of status on public.jobs
for each row execute function public.jobs_check_status_change();

-- A move with an accepted offer is a record (a contract, evidence): it is deleted only on purpose
-- (retention, an erasure request — public.erase_jobs), never as a side effect of deleting a login.
create function public.jobs_keep_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('movershub.erase', true), '') <> 'on'
     and exists (select 1 from public.job_offers o where o.job_id = old.id and o.status = 'accepted') then
    raise exception 'job_kept' using errcode = '22023', hint = 'An accepted move is a record: erase it with public.erase_jobs.';
  end if;
  return old;
end;
$$;

create trigger jobs_keep_records before delete on public.jobs
for each row execute function public.jobs_keep_records();

/** Deletes moves on purpose (retention, erasure, test clean-up) — accepted ones too. Service role only. */
create function public.erase_jobs(p_job_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  erased integer;
begin
  perform set_config('movershub.erase', 'on', true);
  delete from public.jobs where id = any (p_job_ids);
  get diagnostics erased = row_count;
  perform set_config('movershub.erase', 'off', true);
  return erased;
end;
$$;

-- 3. The move's log: the new steps, each once; what a mover reads is limited to the time their
-- offer was open or accepted; append-only; nobody reads the other side's account id.
alter table public.job_events
  drop constraint job_events_event_check,
  add constraint job_events_event_check check (event in (
    'booked', 'offered', 'accepted', 'declined', 'expired', 'cancelled',
    'en_route_to_pickup', 'at_pickup', 'in_transit', 'at_dropoff', 'completed', 'confirmed')),
  add constraint job_events_event_status check (case
    when event in ('en_route_to_pickup', 'at_pickup', 'in_transit', 'at_dropoff', 'completed') then status::text = upper(event)
    when event = 'confirmed' then status = 'COMPLETED'
    when event = 'cancelled' then status = 'CANCELLED'
    else true end);

create unique index job_events_once on public.job_events (job_id, event)
  where event in ('accepted', 'cancelled', 'en_route_to_pickup', 'at_pickup', 'in_transit', 'at_dropoff', 'completed', 'confirmed');
create index job_events_actor_id_idx on public.job_events (actor_id);

drop policy "job_events: movers read the moves offered to them" on public.job_events;
create policy "job_events: movers read their part of a move's log" on public.job_events for select to authenticated
using (exists (
  select 1 from public.job_offers o join public.mover_companies c on c.id = o.mover_company_id
  where o.job_id = job_events.job_id
    and c.owner_id = (select auth.uid())
    and job_events.created_at >= o.created_at
    and (o.status in ('offered', 'accepted') or job_events.created_at <= o.answered_at)
));

revoke select on public.job_events from authenticated;
grant select (id, job_id, event, status, actor_role, created_at) on public.job_events to authenticated;

create trigger job_events_keep before update on public.job_events
for each row execute function public.keep_evidence('actor_id');

-- 4. Photos of the things at the pickup and the drop-off (COMPLIANCE §7).
create type public.job_photo_stage as enum ('pickup', 'dropoff');

create table public.job_photos (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  -- The accepted offer (set by the trigger). Checked at commit: deleting a move takes its photos
  -- first; deleting the offer, its quote or the company alone fails instead of erasing evidence.
  offer_id     uuid not null references public.job_offers (id) deferrable initially deferred,
  stage        public.job_photo_stage not null,
  path         text not null unique check (path ~ '^[0-9a-f-]{36}/(pickup|dropoff)/[a-z0-9]{6,64}\.(jpg|png|webp)$'),
  -- Who added it (set by the trigger).
  uploaded_by  uuid references public.profiles (id) on delete set null,
  -- The server's time it was added during the stop (device clocks can't be trusted).
  taken_at     timestamptz not null default now(),
  constraint job_photos_in_folder check (split_part(path, '/', 1) = job_id::text and split_part(path, '/', 2) = stage::text)
);

create index job_photos_job_stage_idx on public.job_photos (job_id, stage);
create index job_photos_offer_idx on public.job_photos (offer_id);
create index job_photos_uploaded_by_idx on public.job_photos (uploaded_by);

alter table public.job_photos enable row level security;
revoke all on public.job_photos from anon, authenticated;
grant select (id, job_id, stage, path, taken_at) on public.job_photos to authenticated;
grant insert (job_id, stage, path) on public.job_photos to authenticated;
grant all on public.job_photos to service_role;

create policy "job_photos: customers read their moves'" on public.job_photos for select to authenticated
using (exists (select 1 from public.jobs j where j.id = job_photos.job_id and j.customer_id = (select auth.uid())));
create policy "job_photos: the mover who accepted the move reads them" on public.job_photos for select to authenticated
using (exists (
  select 1 from public.job_offers o join public.mover_companies c on c.id = o.mover_company_id
  where o.id = job_photos.offer_id and o.status = 'accepted' and c.owner_id = (select auth.uid())
));
create policy "job_photos: admins read" on public.job_photos for select to authenticated using (public.is_admin());
-- Checked after the BEFORE trigger set offer_id and uploaded_by.
create policy "job_photos: the mover adds them at the stop" on public.job_photos for insert to authenticated
with check (uploaded_by = (select auth.uid()) and exists (
  select 1 from public.job_offers o join public.mover_companies c on c.id = o.mover_company_id
  where o.id = job_photos.offer_id and o.job_id = job_photos.job_id and o.status = 'accepted' and c.owner_id = (select auth.uid())
));

/**
 * A photo row, from any writer: the accepted offer's mover (ownership first, without a lock), the
 * move locked like a step, the file in the move's stage folder (a row saved before answers as the
 * duplicate), the stop open for that stage, the file really in storage, at most 20 per stop. Sets the
 * offer, who added it and the time.
 */
create function public.job_photos_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_offer uuid;
  v_status public.job_status;
begin
  select o.id into v_offer
  from public.job_offers o join public.mover_companies c on c.id = o.mover_company_id
  where o.job_id = new.job_id and o.status = 'accepted' and (uid is null or c.owner_id = uid);
  if v_offer is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select status into v_status from public.jobs where id = new.job_id for update;
  if split_part(new.path, '/', 1) <> new.job_id::text or split_part(new.path, '/', 2) <> new.stage::text then
    raise exception 'photo_path_outside_job' using errcode = '22023';
  end if;
  -- A row sent again after its answer was lost: the duplicate it is, before the closed stop or the
  -- count could refuse it (the app reads 23505 as saved).
  if exists (select 1 from public.job_photos p where p.path = new.path) then
    raise exception 'duplicate key value violates unique constraint "job_photos_path_key"'
      using errcode = '23505', constraint = 'job_photos_path_key';
  end if;
  if v_status is distinct from (case new.stage when 'pickup' then 'AT_PICKUP' else 'AT_DROPOFF' end)::public.job_status then
    raise exception 'photo_stage_closed' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects so where so.bucket_id = 'job-photos' and so.name = new.path) then
    raise exception 'photo_file_missing' using errcode = '22023';
  end if;
  if (select count(*) from public.job_photos p where p.job_id = new.job_id and p.stage = new.stage) >= 20 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;
  new.offer_id := v_offer;
  new.uploaded_by := uid;
  new.taken_at := now();
  return new;
end;
$$;

create trigger job_photos_check before insert on public.job_photos
for each row execute function public.job_photos_check();
create trigger job_photos_keep before update on public.job_photos
for each row execute function public.keep_evidence('uploaded_by');

-- 5. The private photo bucket: added only by the accepted mover into <job>/<stage>/ while that stop is
-- open (at most 30 files per stop folder), read by the customer, that mover and admins; never
-- replaced or removed by clients (the service role removes files no row points to).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function public.can_add_job_photo_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_name ~ '^[0-9a-f-]{36}/(pickup|dropoff)/[a-z0-9]{6,64}\.(jpg|png|webp)$'
    and exists (
      select 1 from public.jobs j
      join public.job_offers o on o.job_id = j.id and o.status = 'accepted'
      join public.mover_companies c on c.id = o.mover_company_id
      where j.id = public.try_uuid(split_part(p_name, '/', 1))
        and c.owner_id = (select auth.uid())
        and j.status = (case split_part(p_name, '/', 2) when 'pickup' then 'AT_PICKUP' else 'AT_DROPOFF' end)::public.job_status
    )
    and (select count(*) from storage.objects so
         where so.bucket_id = 'job-photos' and so.name like split_part(p_name, '/', 1) || '/' || split_part(p_name, '/', 2) || '/%') < 30,
    false)
$$;

create function public.can_read_job_photo_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_admin() or exists (
    select 1 from public.jobs j
    where j.id = public.try_uuid(split_part(p_name, '/', 1))
      and (j.customer_id = (select auth.uid()) or exists (
        select 1 from public.job_offers o join public.mover_companies c on c.id = o.mover_company_id
        where o.job_id = j.id and o.status = 'accepted' and c.owner_id = (select auth.uid())))
  ), false)
$$;

create policy "job-photos: the mover adds photos at the stop" on storage.objects for insert to authenticated
with check (bucket_id = 'job-photos' and public.can_add_job_photo_file(name));
create policy "job-photos: the customer, the mover and admins read" on storage.objects for select to authenticated
using (bucket_id = 'job-photos' and public.can_read_job_photo_file(name));
-- No update or delete policy: files are never overwritten or removed by clients.

-- 6. Cancellations after acceptance: everything a later charge (and DAC7) needs, and the rule that
-- set the fee. Recorded only: nothing is charged before card payments (COMPLIANCE-TODO: §14).
create table public.job_cancellations (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null unique references public.jobs (id) on delete cascade,
  offer_id           uuid not null references public.job_offers (id) deferrable initially deferred,
  quote_id           uuid not null references public.quotes (id) deferrable initially deferred,
  mover_company_id   uuid not null references public.mover_companies (id) deferrable initially deferred,
  cancelled_by       text not null check (cancelled_by in ('customer', 'mover')),
  actor_id           uuid references public.profiles (id) on delete set null,
  status_before      public.job_status not null check (status_before in ('ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP')),
  -- The mover's optional reason, shown to the customer (fixed choices: no free text).
  reason             text check (reason in ('job_differs', 'customer_absent', 'cannot_do')),
  scheduled_at       timestamptz not null,
  cancel_free_hours  integer not null check (cancel_free_hours in (24, 48, 72, 168)),
  cancel_late_pct    integer not null check (cancel_late_pct in (0, 25, 50, 100)),
  free_until         timestamptz not null,
  mover_price        integer not null check (mover_price >= 0),
  currency           public.currency_code not null,
  -- What the customer owes the mover under the mover's terms (minor units), and the rule that set it.
  fee                integer not null check (fee >= 0 and fee <= mover_price),
  fee_rule           text not null check (fee_rule in ('free_period', 'mover_late', 'terms_free', 'late', 'mover_cancelled')),
  created_at         timestamptz not null default now(),
  constraint job_cancellations_mover_free check (cancelled_by = 'customer' or (fee = 0 and fee_rule = 'mover_cancelled')),
  constraint job_cancellations_rule_by_side check ((cancelled_by = 'mover') = (fee_rule = 'mover_cancelled')),
  constraint job_cancellations_reason_by_mover check (reason is null or cancelled_by = 'mover'),
  constraint job_cancellations_absent_at_pickup check (reason is distinct from 'customer_absent' or status_before = 'AT_PICKUP'),
  constraint job_cancellations_fee_by_rule check (fee_rule = 'late' or fee = 0)
);

create index job_cancellations_company_idx on public.job_cancellations (mover_company_id);
create index job_cancellations_offer_idx on public.job_cancellations (offer_id);
create index job_cancellations_quote_idx on public.job_cancellations (quote_id);
create index job_cancellations_actor_id_idx on public.job_cancellations (actor_id);

alter table public.job_cancellations enable row level security;
revoke all on public.job_cancellations from anon, authenticated;
grant select (id, job_id, cancelled_by, status_before, reason, scheduled_at, cancel_free_hours, cancel_late_pct, free_until,
  mover_price, currency, fee, fee_rule, created_at) on public.job_cancellations to authenticated;
grant all on public.job_cancellations to service_role;

create policy "job_cancellations: customers read their moves'" on public.job_cancellations for select to authenticated
using (exists (select 1 from public.jobs j where j.id = job_cancellations.job_id and j.customer_id = (select auth.uid())));
create policy "job_cancellations: movers read their company's" on public.job_cancellations for select to authenticated
using (exists (select 1 from public.mover_companies c where c.id = job_cancellations.mover_company_id and c.owner_id = (select auth.uid())));
create policy "job_cancellations: admins read" on public.job_cancellations for select to authenticated using (public.is_admin());

create trigger job_cancellations_keep before update on public.job_cancellations
for each row execute function public.keep_evidence('actor_id');

-- 7. The rules, as pure functions (the TypeScript mirrors in packages/shared use the same test vectors).

/** From when the mover may mark "On my way": 6 hours before the arrival time, no latest time (owner, 2026-10-17). */
create function public.on_my_way_from(p_scheduled_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_scheduled_at - interval '6 hours'
$$;

/** The step a step comes from (null: not a step). */
create function public.job_step_from(p_to public.job_status)
returns public.job_status
language sql
immutable
set search_path = ''
as $$
  select case p_to
    when 'EN_ROUTE_TO_PICKUP' then 'ACCEPTED'::public.job_status
    when 'AT_PICKUP' then 'EN_ROUTE_TO_PICKUP'::public.job_status
    when 'IN_TRANSIT' then 'AT_PICKUP'::public.job_status
    when 'AT_DROPOFF' then 'IN_TRANSIT'::public.job_status
    when 'COMPLETED' then 'AT_DROPOFF'::public.job_status
  end
$$;

/**
 * Until when cancelling is free: the arrival time minus the mover's hours (24, 48 or 72 hours), or for
 * "7 days" the same wall-clock time 7 days before in Central Europe — whichever is later, so a clock
 * change never takes an hour from the customer.
 */
create function public.cancellation_free_until(p_scheduled_at timestamptz, p_free_hours integer)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_free_hours = 168 then greatest(
      p_scheduled_at - interval '168 hours',
      ((p_scheduled_at at time zone 'Europe/Belgrade') - interval '7 days') at time zone 'Europe/Belgrade')
    else p_scheduled_at - make_interval(hours => p_free_hours)
  end
$$;

/**
 * The customer's cancellation charge after acceptance, in the quote's minor units, and the rule that
 * set it:
 *   free_period — until free_until, that moment included;
 *   mover_late  — from 60 minutes after the arrival time, while no pickup photo was added before then
 *                 (a photo is what shows the mover was there; "Arrived" alone is the mover's word —
 *                 owner, 2026-10-17; COMPLIANCE-TODO: §14);
 *   terms_free  — the mover's terms charge nothing later either;
 *   late        — the mover's share, rounded down (to whole lek, denar, dinar for those currencies).
 * Null when the move can't be cancelled with the mover's terms (not accepted yet, or loaded).
 */
create function public.cancellation_fee(
  p_mover_price integer,
  p_late_pct integer,
  p_currency public.currency_code,
  p_free_until timestamptz,
  p_scheduled_at timestamptz,
  p_status public.job_status,
  p_first_pickup_photo_at timestamptz,
  p_at timestamptz,
  out fee integer,
  out rule text
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_status not in ('ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP') then
    fee := null; rule := null;
  elsif p_at <= p_free_until then
    fee := 0; rule := 'free_period';
  elsif p_at >= p_scheduled_at + interval '60 minutes'
        and (p_first_pickup_photo_at is null or p_first_pickup_photo_at >= p_scheduled_at + interval '60 minutes') then
    fee := 0; rule := 'mover_late';
  elsif p_late_pct = 0 then
    fee := 0; rule := 'terms_free';
  elsif p_currency in ('ALL', 'MKD', 'RSD') then
    fee := ((p_mover_price::bigint * p_late_pct / 100) / 100 * 100)::integer; rule := 'late';
  else
    fee := (p_mover_price::bigint * p_late_pct / 100)::integer; rule := 'late';
  end if;
end;
$$;

-- 8. The transitions (service role only: the `job-transition` function says who is asking).

/**
 * The accepted mover marks the next step (`p_to`). Repeating the step the move is at changes nothing
 * (a retry). Refusals: invalid_step, not_found, job_cancelled, wrong_step, too_early (DETAIL: from),
 * photos_required.
 */
create function public.job_step(p_job_id uuid, p_mover_id uuid, p_to public.job_status)
returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.job_status := public.job_step_from(p_to);
  j public.jobs;
begin
  if v_from is null then
    raise exception 'invalid_step' using errcode = '22023';
  end if;
  -- Ownership in the locking statement: nobody else may hold the move's row.
  select jj.* into j from public.jobs jj
  where jj.id = p_job_id and exists (
    select 1 from public.job_offers o join public.mover_companies c on c.id = o.mover_company_id
    where o.job_id = jj.id and o.status = 'accepted' and c.owner_id = p_mover_id)
  for update of jj;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if j.status = p_to then
    return p_to;
  end if;
  if j.status = 'CANCELLED' then
    raise exception 'job_cancelled' using errcode = '22023';
  end if;
  if j.status <> v_from then
    raise exception 'wrong_step' using errcode = '22023', detail = j.status::text;
  end if;
  if p_to = 'EN_ROUTE_TO_PICKUP' and now() < public.on_my_way_from(j.scheduled_at) then
    raise exception 'too_early' using errcode = '22023', detail = json_build_object('from', public.on_my_way_from(j.scheduled_at))::text;
  end if;
  if (p_to = 'IN_TRANSIT' and not exists (select 1 from public.job_photos p where p.job_id = j.id and p.stage = 'pickup'))
     or (p_to = 'COMPLETED' and not exists (select 1 from public.job_photos p where p.job_id = j.id and p.stage = 'dropoff')) then
    raise exception 'photos_required' using errcode = '22023';
  end if;
  update public.jobs set status = p_to where id = j.id;
  insert into public.job_events (job_id, event, status, actor_id, actor_role)
  values (j.id, lower(p_to::text), p_to, p_mover_id, 'mover');
  -- STRIPE (build step 8): COMPLETED → the off-session PaymentIntent for the accepted offer's quote
  -- (total + approved adjustments; application_fee_amount = platform_commission + booking_fee;
  -- transfer_data.destination = the mover's account), idempotency key 'complete:' || job id; never
  -- for is_test companies. The payout clock starts at this event.
  return p_to;
end;
$$;

-- The customer cancels: before acceptance for free (as in 5.1); after acceptance until loaded, under
-- the mover's terms in the accepted offer's quote, never above `p_max_fee` — the amount the customer
-- was shown (fee_changed, nothing written; DETAIL: fee, currency, freeUntil). A retry returns the
-- recorded fee. Returns the fee (0 before acceptance).
drop function public.job_cancel(uuid, uuid);

create function public.job_cancel(p_job_id uuid, p_customer_id uuid, p_max_fee integer default 0)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  o public.job_offers;
  q public.quotes;
  v_free_until timestamptz;
  v_first_photo timestamptz;
  v_fee integer;
  v_rule text;
begin
  select * into j from public.jobs where id = p_job_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if j.status = 'CANCELLED' then
    if exists (select 1 from public.job_events e where e.job_id = j.id and e.event = 'cancelled' and e.actor_role = 'customer') then
      return coalesce((select x.fee from public.job_cancellations x where x.job_id = j.id), 0);
    end if;
    raise exception 'not_cancellable' using errcode = '22023';
  end if;
  if j.status in ('QUOTED', 'BOOKED', 'OFFERED') then
    update public.job_offers set status = 'cancelled', answered_at = now() where job_id = j.id and status = 'offered';
    update public.jobs set status = 'CANCELLED' where id = j.id;
    insert into public.job_events (job_id, event, status, actor_id, actor_role) values (j.id, 'cancelled', 'CANCELLED', p_customer_id, 'customer');
    return 0;
  end if;
  if j.status not in ('ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP') then
    raise exception 'not_cancellable' using errcode = '22023', hint = 'Once the things are loaded, the move is not cancelled in the app.';
  end if;
  select * into o from public.job_offers where job_id = j.id and status = 'accepted';
  select * into q from public.quotes where id = o.quote_id;
  v_free_until := public.cancellation_free_until(j.scheduled_at, q.cancel_free_hours);
  select min(p.taken_at) into v_first_photo from public.job_photos p where p.job_id = j.id and p.stage = 'pickup';
  select f.fee, f.rule into v_fee, v_rule
  from public.cancellation_fee(q.mover_price, q.cancel_late_pct, q.currency, v_free_until, j.scheduled_at, j.status, v_first_photo, now()) f;
  if v_fee > greatest(coalesce(p_max_fee, 0), 0) then
    raise exception 'fee_changed' using errcode = '22023',
      detail = json_build_object('fee', v_fee, 'currency', q.currency, 'freeUntil', v_free_until)::text;
  end if;
  insert into public.job_cancellations (job_id, offer_id, quote_id, mover_company_id, cancelled_by, actor_id, status_before,
    scheduled_at, cancel_free_hours, cancel_late_pct, free_until, mover_price, currency, fee, fee_rule)
  values (j.id, o.id, q.id, o.mover_company_id, 'customer', p_customer_id, j.status,
    j.scheduled_at, q.cancel_free_hours, q.cancel_late_pct, v_free_until, q.mover_price, q.currency, v_fee, v_rule);
  update public.jobs set status = 'CANCELLED' where id = j.id;
  insert into public.job_events (job_id, event, status, actor_id, actor_role) values (j.id, 'cancelled', 'CANCELLED', p_customer_id, 'customer');
  -- STRIPE (build step 8): fee > 0 and CANCELLATION_FEES_CHARGED → an off-session charge to the
  -- mover's account (no commission — owner, 2026-10-17), idempotency key 'cancel:' || job id; never
  -- for is_test companies or rows recorded before card payments.
  return v_fee;
end;
$$;

/**
 * The accepted mover cancels before loading: free for everyone, never counted against them
 * (COMPLIANCE §2, §3); the move is cancelled for good and nobody else is assigned — the customer books
 * another mover. Optional reason: job_differs, cannot_do, or customer_absent — only at the pickup, 15
 * minutes after the later of the arrival time and their arrival (reason_too_early; DETAIL: from).
 */
create function public.job_mover_cancel(p_job_id uuid, p_mover_id uuid, p_reason text default null)
returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  o public.job_offers;
  q public.quotes;
  v_arrived timestamptz;
  v_absent_from timestamptz;
begin
  select jj.* into j from public.jobs jj
  where jj.id = p_job_id and exists (
    select 1 from public.job_offers oo join public.mover_companies c on c.id = oo.mover_company_id
    where oo.job_id = jj.id and oo.status = 'accepted' and c.owner_id = p_mover_id)
  for update of jj;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if j.status = 'CANCELLED' then
    if exists (select 1 from public.job_cancellations x where x.job_id = j.id and x.cancelled_by = 'mover') then
      return 'CANCELLED';
    end if;
    raise exception 'job_cancelled' using errcode = '22023';
  end if;
  if j.status not in ('ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP') then
    raise exception 'not_cancellable' using errcode = '22023';
  end if;
  if p_reason is not null and p_reason not in ('job_differs', 'customer_absent', 'cannot_do') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if p_reason = 'customer_absent' then
    if j.status <> 'AT_PICKUP' then
      raise exception 'invalid_reason' using errcode = '22023', hint = 'Only at the pickup.';
    end if;
    select min(e.created_at) into v_arrived from public.job_events e where e.job_id = j.id and e.event = 'at_pickup';
    v_absent_from := greatest(j.scheduled_at, v_arrived) + interval '15 minutes';
    if now() < v_absent_from then
      raise exception 'reason_too_early' using errcode = '22023', detail = json_build_object('from', v_absent_from)::text;
    end if;
  end if;
  select * into o from public.job_offers where job_id = j.id and status = 'accepted';
  select * into q from public.quotes where id = o.quote_id;
  insert into public.job_cancellations (job_id, offer_id, quote_id, mover_company_id, cancelled_by, actor_id, status_before, reason,
    scheduled_at, cancel_free_hours, cancel_late_pct, free_until, mover_price, currency, fee, fee_rule)
  values (j.id, o.id, q.id, o.mover_company_id, 'mover', p_mover_id, j.status, p_reason,
    j.scheduled_at, q.cancel_free_hours, q.cancel_late_pct, public.cancellation_free_until(j.scheduled_at, q.cancel_free_hours),
    q.mover_price, q.currency, 0, 'mover_cancelled');
  update public.jobs set status = 'CANCELLED' where id = j.id;
  insert into public.job_events (job_id, event, status, actor_id, actor_role) values (j.id, 'cancelled', 'CANCELLED', p_mover_id, 'mover');
  return 'CANCELLED';
end;
$$;

/** The customer confirms the move is done (once; the hook for releasing the payout later). */
create function public.job_confirm(p_job_id uuid, p_customer_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  v_at timestamptz;
begin
  select * into j from public.jobs where id = p_job_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if j.status <> 'COMPLETED' then
    raise exception 'not_confirmable' using errcode = '22023';
  end if;
  select e.created_at into v_at from public.job_events e where e.job_id = j.id and e.event = 'confirmed';
  if found then
    return v_at;
  end if;
  insert into public.job_events (job_id, event, status, actor_id, actor_role)
  values (j.id, 'confirmed', 'COMPLETED', p_customer_id, 'customer')
  returning created_at into v_at;
  -- STRIPE (build step 8): release the mover's payout now (else 48 hours after 'completed' with no dispute).
  return v_at;
end;
$$;

-- 9. What a mover sees (COMPLIANCE §9.1): open offers (the area only), and accepted moves — the exact
-- place, the customer's directions and coordinates only while it is needed: not once cancelled; for a
-- move not ended, until 7 days after its day; once done, for 7 days. Ended moves are listed for 7 days
-- when asked (`p_include_ended`: the job-day app); called without it — older app builds — open offers
-- and accepted moves not ended, as before.
drop function public.my_mover_jobs();

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
  absent_reason_from   timestamptz
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
    case when t.arrived_at is not null then greatest(j.scheduled_at, t.arrived_at) + interval '15 minutes' end
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

-- 10. Grants.
revoke execute on function public.try_uuid(text) from public, anon, authenticated;
revoke execute on function public.keep_evidence() from public, anon, authenticated;
revoke execute on function public.job_status_change_allowed(public.job_status, public.job_status) from public, anon, authenticated;
revoke execute on function public.jobs_check_status_change() from public, anon, authenticated;
revoke execute on function public.jobs_keep_records() from public, anon, authenticated;
revoke execute on function public.erase_jobs(uuid[]) from public, anon, authenticated;
revoke execute on function public.job_photos_check() from public, anon, authenticated;
revoke execute on function public.on_my_way_from(timestamptz) from public, anon, authenticated;
revoke execute on function public.job_step_from(public.job_status) from public, anon, authenticated;
revoke execute on function public.cancellation_free_until(timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.cancellation_fee(integer, integer, public.currency_code, timestamptz, timestamptz, public.job_status, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.job_step(uuid, uuid, public.job_status) from public, anon, authenticated;
revoke execute on function public.job_cancel(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.job_mover_cancel(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.job_confirm(uuid, uuid) from public, anon, authenticated;
grant execute on function public.erase_jobs(uuid[]) to service_role;
grant execute on function public.cancellation_free_until(timestamptz, integer) to service_role;
grant execute on function public.cancellation_fee(integer, integer, public.currency_code, timestamptz, timestamptz, public.job_status, timestamptz, timestamptz) to service_role;
grant execute on function public.job_step(uuid, uuid, public.job_status) to service_role;
grant execute on function public.job_cancel(uuid, uuid, integer) to service_role;
grant execute on function public.job_mover_cancel(uuid, uuid, text) to service_role;
grant execute on function public.job_confirm(uuid, uuid) to service_role;
revoke execute on function public.can_add_job_photo_file(text) from public, anon;
revoke execute on function public.can_read_job_photo_file(text) from public, anon;
grant execute on function public.can_add_job_photo_file(text) to authenticated;
grant execute on function public.can_read_job_photo_file(text) to authenticated;
revoke execute on function public.my_mover_jobs(boolean) from public, anon;
grant execute on function public.my_mover_jobs(boolean) to authenticated;
