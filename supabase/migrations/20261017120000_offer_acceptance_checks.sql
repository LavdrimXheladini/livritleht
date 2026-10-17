-- Step 5.1 hardened before the job day (design/DECISIONS.md #36; COMPLIANCE §5 "Block job acceptance
-- if insurance is missing or expired", §6, §11, §13):
--   1. Accepting re-checks the mover for the move day: the van the customer booked must still be
--      quotable for this move (verified company and van, payouts set up, current mover terms,
--      insurance — across a border CMR, licence and tachograph — valid on the move day, no reviewed
--      suspension by then). The same rules as quoting (quotable_vehicles), so nothing can drift.
--   2. One lock order everywhere: the move's row (jobs) first, then its offer. The expiry job never
--      waits for a move another step holds.
--   3. Clearer refusals: an offer the customer cancelled answers not_open, an expired one
--      offer_expired.
--   4. A booked move is frozen: its day, stops, things and mover don't change once it is past a
--      saved request, no new price is saved for it, and booking needs the price saved for the move as
--      it is now (a quote newer than the request's last change).

-- 1–3. Answering an offer.
create or replace function public.job_answer_offer(p_offer_id uuid, p_mover_id uuid, p_accept boolean)
returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job uuid;
  j public.jobs;
  o public.job_offers;
  v_van uuid;
  next_status public.job_status := case when p_accept then 'ACCEPTED' else 'QUOTED' end;
begin
  -- Whose offer it is, first, without a lock: nobody else may hold the move's row.
  select o2.job_id into v_job
  from public.job_offers o2
  join public.mover_companies c on c.id = o2.mover_company_id
  where o2.id = p_offer_id and c.owner_id = p_mover_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- The move first, then the offer (the lock order of every job function).
  select * into j from public.jobs where id = v_job for update;
  select * into o from public.job_offers where id = p_offer_id for update;
  if o.status = 'cancelled' then
    raise exception 'not_open' using errcode = '22023';
  end if;
  if o.status = 'expired' then
    raise exception 'offer_expired' using errcode = '22023';
  end if;
  if o.status <> 'offered' then
    raise exception 'already_answered' using errcode = '22023';
  end if;
  if o.expires_at <= now() then
    raise exception 'offer_expired' using errcode = '22023';
  end if;
  if j.status <> 'OFFERED' then
    raise exception 'not_open' using errcode = '22023';
  end if;
  -- Accepting: the van the customer booked is still quotable for this move on its day. Declining
  -- never checks anything: it is always free (COMPLIANCE §2).
  if p_accept then
    select q.vehicle_id into v_van from public.quotes q where q.id = o.quote_id;
    if not exists (
      select 1
      from public.quotable_vehicles(j.pickup_point, j.pickup_country, j.dropoff_country, j.vehicle_class, true, j.scheduled_at) v
      where v.vehicle_id = v_van and v.company_id = o.mover_company_id
    ) then
      raise exception 'not_eligible' using errcode = '22023',
        hint = 'On the move day: a checked company and van, payouts, the current terms, valid insurance (across a border CMR and licence), the pickup in a work area, own prices and cancellation terms.';
    end if;
  end if;
  update public.job_offers
  set status = case when p_accept then 'accepted' else 'declined' end::public.offer_status, answered_at = now()
  where id = o.id;
  update public.jobs set status = next_status where id = j.id;
  insert into public.job_events (job_id, event, status, actor_id, actor_role)
  values (j.id, case when p_accept then 'accepted' else 'declined' end, next_status, p_mover_id, 'mover');
  return next_status;
end;
$$;

-- 2. Offers nobody answered in time: candidates read without a lock; then the move (skipped while a
-- step holds it — the next run takes it), then the offer, checked again.
create or replace function public.expire_job_offers(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended integer := 0;
  c record;
  o public.job_offers;
begin
  for c in
    select id, job_id from public.job_offers where status = 'offered' and expires_at <= p_now
  loop
    perform 1 from public.jobs where id = c.job_id for update skip locked;
    if not found then
      continue;
    end if;
    select * into o from public.job_offers where id = c.id and status = 'offered' and expires_at <= p_now for update;
    if not found then
      continue;
    end if;
    update public.job_offers set status = 'expired', answered_at = p_now where id = o.id;
    update public.jobs set status = 'QUOTED' where id = o.job_id and status = 'OFFERED';
    insert into public.job_events (job_id, event, status, actor_role) values (o.job_id, 'expired', 'QUOTED', 'system');
    ended := ended + 1;
  end loop;
  return ended;
end;
$$;

-- 4. Booking needs the price of the move as it is now: a quote saved after the request's last
-- change (`book` changes the request, then saves its new quote in a second request).
create or replace function public.job_book(p_job_id uuid, p_customer_id uuid, p_without_card boolean)
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

-- 4. Once past a saved request, a move's facts stay as booked (the mover's price and terms were
-- worked out for exactly them). Only its status changes — and updated_at with it.
create function public.jobs_keep_booked_facts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status not in ('DRAFT', 'QUOTED')
     and (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'job_frozen' using errcode = '22023', hint = 'A booked move keeps its day, stops, things and mover.';
  end if;
  return new;
end;
$$;

create trigger jobs_keep_booked_facts before update on public.jobs
for each row execute function public.jobs_keep_booked_facts();

/** No new price for a move past a saved request: the booked quote stays the one that counts. */
create function public.quotes_only_for_requests()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.jobs j where j.id = new.job_id and j.status not in ('DRAFT', 'QUOTED')) then
    raise exception 'job_not_open' using errcode = '22023', hint = 'A booked move keeps the price it was booked at.';
  end if;
  return new;
end;
$$;

create trigger quotes_only_for_requests before insert on public.quotes
for each row execute function public.quotes_only_for_requests();

revoke execute on function public.jobs_keep_booked_facts() from public, anon, authenticated;
revoke execute on function public.quotes_only_for_requests() from public, anon, authenticated;
