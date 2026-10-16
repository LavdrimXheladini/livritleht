-- Terms versions, accepting them, and notice of changes (COMPLIANCE §3, §8; P2B Regulation
-- 2019/1150 Art. 3; design/DECISIONS.md #34).
--
-- An admin publishes the terms in the app's code (packages/i18n/src/legal) as a numbered version for
-- customers or for movers, with the day it applies. The published text is kept as it was: the
-- evidence of what people accepted. Movers are told of new terms in the app (email later) and they
-- apply at least 15 days after publishing — except the first version, which changes nothing anyone
-- had. A version not yet in effect can be withdrawn. Once a version applies, the app asks for it to
-- be accepted; until then a customer can't book (the `book` function) and a mover isn't quoted
-- (`quotable_vehicles`; test movers are the platform's own). With no version published, nothing
-- changes: there is nothing to accept.

create type public.terms_audience as enum ('customer', 'mover');

-- 1. Versions: readable by everyone (the terms are public); written by the admin functions below.
create table public.terms_versions (
  id              uuid primary key default gen_random_uuid(),
  audience        public.terms_audience not null,
  version         integer not null check (version > 0),
  -- The language the text was published in (English until it is translated).
  locale          text not null default 'en' check (locale in ('en', 'sq', 'pl', 'sr', 'de')),
  -- Where the text is read in the app and on the website.
  document_path   text not null,
  -- The text as published: what people accepted.
  content         jsonb not null check (jsonb_typeof(content) = 'object'),
  content_sha256  text not null,
  -- What changed, for the notice (every version after the first).
  summary         text check (summary is null or char_length(btrim(summary)) between 3 and 2000),
  published_by    uuid references public.profiles (id) on delete set null,
  published_at    timestamptz not null default now(),
  effective_at    timestamptz not null,
  withdrawn_at    timestamptz,
  unique (audience, version),
  constraint terms_versions_effective_after_publishing check (effective_at >= published_at),
  constraint terms_versions_withdrawn_before_effect check (withdrawn_at is null or withdrawn_at < effective_at)
);

create index terms_versions_audience_idx on public.terms_versions (audience, effective_at desc);

alter table public.terms_versions enable row level security;
revoke all on public.terms_versions from anon, authenticated;
grant select on public.terms_versions to anon, authenticated;
grant all on public.terms_versions to service_role;

create policy "terms_versions: everyone reads the published ones" on public.terms_versions for select to anon, authenticated
using (withdrawn_at is null);
create policy "terms_versions: admins read all" on public.terms_versions for select to authenticated using (public.is_admin());

-- 2. Acceptances: the person's own (through accept_terms); admins read all.
create table public.terms_acceptances (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  terms_version_id  uuid not null references public.terms_versions (id) on delete restrict,
  accepted_at       timestamptz not null default now(),
  unique (user_id, terms_version_id)
);

create index terms_acceptances_version_idx on public.terms_acceptances (terms_version_id);

alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;
grant all on public.terms_acceptances to service_role;

create policy "terms_acceptances: own" on public.terms_acceptances for select to authenticated using (user_id = (select auth.uid()));
create policy "terms_acceptances: admins read" on public.terms_acceptances for select to authenticated using (public.is_admin());

-- 3. Notices to movers of new terms (in the app now; by email once there is an email provider).
create table public.terms_notices (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.mover_companies (id) on delete cascade,
  terms_version_id  uuid not null references public.terms_versions (id) on delete cascade,
  channel           text not null check (channel in ('email', 'in_app')),
  sent_at           timestamptz not null default now(),
  unique (company_id, terms_version_id, channel)
);

create index terms_notices_version_idx on public.terms_notices (terms_version_id);

alter table public.terms_notices enable row level security;
revoke all on public.terms_notices from anon, authenticated;
grant select on public.terms_notices to authenticated;
grant all on public.terms_notices to service_role;

create policy "terms_notices: owners read theirs" on public.terms_notices for select to authenticated
using (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "terms_notices: admins read" on public.terms_notices for select to authenticated using (public.is_admin());

-- 4. The decision log takes publishing and withdrawing terms.
alter table public.audit_log
  drop constraint audit_log_action_check,
  add constraint audit_log_action_check check (action in ('verify', 'reject', 'suspend', 'lift', 'uphold', 'dismiss', 'publish', 'withdraw')),
  drop constraint audit_log_entity_check,
  add constraint audit_log_entity_check check (entity in ('mover_company', 'mover_document', 'vehicle', 'suspension', 'appeal', 'terms_version'));

-- 5. Which version applies, and whether someone accepted it.

/** The version of the terms for `p_audience` in effect at `p_at` (null before the first). */
create function public.current_terms(p_audience public.terms_audience, p_at timestamptz default now())
returns public.terms_versions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.terms_versions
  where audience = p_audience and withdrawn_at is null and effective_at <= p_at
  order by effective_at desc, version desc
  limit 1
$$;

/** True when the person accepted the terms for `p_audience` in effect now — or none is in effect yet. */
create function public.terms_accepted(p_user_id uuid, p_audience public.terms_audience)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (public.current_terms(p_audience)).id is null then true
    else exists (
      select 1 from public.terms_acceptances a
      where a.user_id = p_user_id and a.terms_version_id = (public.current_terms(p_audience)).id
    )
  end
$$;

revoke execute on function public.current_terms(public.terms_audience, timestamptz) from public, anon;
revoke execute on function public.terms_accepted(uuid, public.terms_audience) from public, anon, authenticated;
grant execute on function public.current_terms(public.terms_audience, timestamptz) to authenticated, service_role;
grant execute on function public.terms_accepted(uuid, public.terms_audience) to service_role;

-- 6. Accepting: the signed-in person, a published version for their side.

/** Accepts a published version of the terms for the caller's side; once. Returns when it was accepted. */
create function public.accept_terms(p_version_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v public.terms_versions;
  side public.user_role;
  accepted timestamptz;
begin
  if uid is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  select * into v from public.terms_versions where id = p_version_id and withdrawn_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select role into side from public.profiles where id = uid;
  if side is null or side::text <> v.audience::text then
    raise exception 'wrong_side' using errcode = '22023', hint = 'Accept the terms for the side you are on.';
  end if;
  insert into public.terms_acceptances (user_id, terms_version_id) values (uid, v.id)
  on conflict (user_id, terms_version_id) do nothing;
  select a.accepted_at into accepted from public.terms_acceptances a where a.user_id = uid and a.terms_version_id = v.id;
  return accepted;
end;
$$;

revoke execute on function public.accept_terms(uuid) from public, anon;
grant execute on function public.accept_terms(uuid) to authenticated;

-- 7. The admins' actions (their own session — no service key on the website).

/**
 * Publishes `p_content` (the text in the app's code) as the next version of the terms for
 * `p_audience`, applying from `p_effective_at` (now when null). New terms for movers apply at least
 * 15 days after publishing, except the first version; every version after the first says what
 * changed. One version waits at a time. Movers are told in the app at once.
 */
create function public.admin_publish_terms(
  p_audience public.terms_audience,
  p_content jsonb,
  p_summary text default null,
  p_effective_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  summary text := nullif(btrim(coalesce(p_summary, '')), '');
  effective timestamptz := coalesce(p_effective_at, now());
  latest public.terms_versions;
  next_version integer;
  published uuid;
begin
  if not public.is_admin() then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or not (p_content ? 'text') then
    raise exception 'content_required' using errcode = '22023';
  end if;
  -- Serialise publishing per audience.
  perform pg_advisory_xact_lock(hashtext('terms:' || p_audience::text));
  if exists (select 1 from public.terms_versions where audience = p_audience and withdrawn_at is null and effective_at > now()) then
    raise exception 'upcoming_exists' using errcode = '22023', hint = 'A version is waiting to apply: withdraw it first.';
  end if;
  select * into latest from public.terms_versions
  where audience = p_audience and withdrawn_at is null
  order by effective_at desc, version desc limit 1;
  if effective < now() then
    effective := now();
  end if;
  if latest.id is not null then
    if latest.content = p_content then
      raise exception 'unchanged' using errcode = '22023', hint = 'This text is already the latest version.';
    end if;
    if summary is null or char_length(summary) < 3 then
      raise exception 'summary_required' using errcode = '22023', hint = 'Say what changed: people read it in the notice.';
    end if;
    if p_audience = 'mover' and effective < now() + interval '15 days' then
      raise exception 'notice_too_short' using errcode = '22023', hint = 'New terms for movers apply at least 15 days after they are published.';
    end if;
  end if;
  select coalesce(max(version), 0) + 1 into next_version from public.terms_versions where audience = p_audience;
  insert into public.terms_versions (audience, version, document_path, content, content_sha256, summary, published_by, effective_at)
  values (
    p_audience,
    next_version,
    case p_audience when 'customer' then '/legal/terms' else '/legal/mover-terms' end,
    p_content,
    encode(sha256(convert_to(p_content::text, 'UTF8')), 'hex'),
    summary,
    (select auth.uid()),
    effective
  )
  returning id into published;
  if p_audience = 'mover' then
    insert into public.terms_notices (company_id, terms_version_id, channel)
    select c.id, published, 'in_app' from public.mover_companies c where not c.is_test;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, note)
  values ((select auth.uid()), 'publish', 'terms_version', published, left(coalesce(summary, p_audience::text || ' terms, version ' || next_version), 1000));
  return published;
end;
$$;

/** Withdraws a version that doesn't apply yet (it then never applies), with a note for the record. */
create function public.admin_withdraw_terms(p_version_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if char_length(note) < 3 then
    raise exception 'note_required' using errcode = '22023';
  end if;
  update public.terms_versions set withdrawn_at = now()
  where id = p_version_id and withdrawn_at is null and effective_at > now();
  if not found then
    raise exception 'already_in_effect' using errcode = '22023', hint = 'Only a version that does not apply yet can be withdrawn.';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, note)
  values ((select auth.uid()), 'withdraw', 'terms_version', p_version_id, left(note, 1000));
end;
$$;

revoke execute on function public.admin_publish_terms(public.terms_audience, jsonb, text, timestamptz) from public, anon;
revoke execute on function public.admin_withdraw_terms(uuid, text) from public, anon;
grant execute on function public.admin_publish_terms(public.terms_audience, jsonb, text, timestamptz) to authenticated;
grant execute on function public.admin_withdraw_terms(uuid, text) to authenticated;

-- 8. Quotes: a mover is shown only once they accepted the terms for movers in effect (same
-- signature and columns as 20261015130000; one condition more).
create or replace function public.quotable_vehicles(
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
  insurance_until             timestamptz,
  cancel_free_hours           integer,
  cancel_late_pct             integer
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
     where d.company_id = c.id and d.type = 'insurance' and d.verified_at is not null),
    c.cancel_free_hours,
    c.cancel_late_pct
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
    -- Customers see the mover's cancellation terms before booking (COMPLIANCE §8).
    and c.cancel_free_hours is not null
    -- The owner accepted the terms for movers in effect (nothing to accept before the first version).
    -- Test movers are the platform's own.
    and (c.is_test or public.terms_accepted(c.owner_id, 'mover'))
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
