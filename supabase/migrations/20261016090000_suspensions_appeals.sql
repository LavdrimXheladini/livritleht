-- Suspensions in practice, and movers' appeals (COMPLIANCE §3; design/DECISIONS.md #32).
--
-- An admin (a person — the algorithm may only flag) suspends a mover or ends their account on the
-- website's admin page, with a written statement of reasons; the mover is told at once (in the app;
-- by email once there is an email provider). Ending an account takes effect 30 days after the notice
-- unless it is a serious violation — the table's own checks (20261012140000) enforce that. The mover
-- appeals in the app; an admin upholds the appeal (the decision is lifted) or rejects it, with a reason
-- the mover reads. Every step is in audit_log. "Restriction" is not offered until what it restricts is
-- decided (it has no effect on quotes).

-- 1. The decision log takes suspensions, lifting them and appeals.
alter table public.audit_log
  drop constraint audit_log_action_check,
  add constraint audit_log_action_check check (action in ('verify', 'reject', 'suspend', 'lift', 'uphold', 'dismiss')),
  drop constraint audit_log_entity_check,
  add constraint audit_log_entity_check check (entity in ('mover_company', 'mover_document', 'vehicle', 'suspension', 'appeal'));

-- 2. Admins read every decision (movers read their own once notified, 20261012140000).
create policy "suspensions: admins read" on public.suspensions for select to authenticated using (public.is_admin());

-- 3. Appeals.
create type public.appeal_subject as enum ('restriction', 'suspension', 'termination', 'document_rejection', 'other');
create type public.appeal_status as enum ('open', 'under_review', 'upheld', 'rejected');

create table public.mover_appeals (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.mover_companies (id) on delete cascade,
  suspension_id    uuid references public.suspensions (id) on delete cascade,
  subject          public.appeal_subject not null,
  text             text not null check (char_length(btrim(text)) between 10 and 4000),
  -- A file with the appeal (later: private storage, like documents).
  attachment_path  text,
  status           public.appeal_status not null default 'open',
  reviewed_by      uuid references public.profiles (id) on delete restrict,
  decision_reason  text check (decision_reason is null or char_length(btrim(decision_reason)) between 10 and 4000),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  constraint mover_appeals_decided check (
    (status in ('upheld', 'rejected')) = (resolved_at is not null and decision_reason is not null and reviewed_by is not null)
  )
);

create index mover_appeals_company_id_idx on public.mover_appeals (company_id);
-- One appeal at a time per decision (another may follow a rejected one).
create unique index mover_appeals_one_open on public.mover_appeals (suspension_id) where status in ('open', 'under_review');

alter table public.mover_appeals enable row level security;
revoke all on public.mover_appeals from anon, authenticated;
grant select on public.mover_appeals to authenticated;
grant insert (company_id, suspension_id, subject, text) on public.mover_appeals to authenticated;
grant all on public.mover_appeals to service_role;

create policy "mover_appeals: owners read theirs" on public.mover_appeals for select to authenticated
using (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "mover_appeals: admins read" on public.mover_appeals for select to authenticated using (public.is_admin());
create policy "mover_appeals: owners appeal" on public.mover_appeals for insert to authenticated
with check (exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid())));

/**
 * A mover's appeal: about a decision they were told of and that still applies (its subject is the
 * decision's kind), or a complaint about anything else (no decision). At most 3 waiting at a time.
 */
create function public.mover_appeals_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.suspensions;
begin
  -- Someone else's company: refused before anything about it is looked at (RLS would refuse it too).
  if (select auth.uid()) is not null
     and not exists (select 1 from public.mover_companies c where c.id = new.company_id and c.owner_id = (select auth.uid())) then
    raise exception 'not_your_company' using errcode = '42501';
  end if;
  if new.suspension_id is not null then
    select * into s from public.suspensions where id = new.suspension_id;
    if not found or s.company_id <> new.company_id or s.notice_sent_at is null or s.lifted_at is not null then
      raise exception 'not_appealable' using errcode = '22023', hint = 'Appeal a decision you were told of that still applies.';
    end if;
    new.subject := s.kind::text::public.appeal_subject;
  elsif new.subject not in ('document_rejection', 'other') then
    raise exception 'not_appealable' using errcode = '22023', hint = 'An appeal about a decision names the decision.';
  end if;
  if (select count(*) from public.mover_appeals a where a.company_id = new.company_id and a.status in ('open', 'under_review')) >= 3 then
    raise exception 'too_many_open' using errcode = '22023', hint = 'Wait for the answers to the appeals already sent.';
  end if;
  return new;
end;
$$;

create trigger mover_appeals_check before insert on public.mover_appeals
for each row execute function public.mover_appeals_check();

revoke execute on function public.mover_appeals_check() from public, anon, authenticated;

-- 4. The admins' actions (their own session — no service key on the website).

/**
 * Suspends a mover or ends their account, reviewed by the admin calling it, with the reasons the mover
 * reads (at least 10 characters). Takes effect at `p_effective_at` — now by default; for an account
 * ended without a serious violation, 30 days after this notice at the earliest (the default).
 */
create function public.admin_decide_suspension(
  p_company_id uuid,
  p_kind public.suspension_kind,
  p_reason text,
  p_serious boolean default false,
  p_effective_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := btrim(coalesce(p_reason, ''));
  effective timestamptz;
  decided uuid;
begin
  if not public.is_admin() then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_kind = 'restriction' then
    raise exception 'kind_not_available' using errcode = '22023', hint = 'What a restriction limits is not decided yet.';
  end if;
  if char_length(reason) < 10 then
    raise exception 'reason_required' using errcode = '22023', hint = 'Write the reasons the mover will read (10+ characters).';
  end if;
  if not exists (select 1 from public.mover_companies where id = p_company_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  effective := coalesce(
    p_effective_at,
    case when p_kind = 'termination' and not p_serious then now() + interval '30 days' else now() end
  );
  if effective < now() then
    raise exception 'effective_in_past' using errcode = '22023';
  end if;
  if p_kind = 'termination' and not p_serious and effective < now() + interval '30 days' then
    raise exception 'notice_too_short' using errcode = '22023', hint = 'Ending an account takes 30 days'' notice, unless it is a serious violation.';
  end if;
  insert into public.suspensions (company_id, kind, flagged_by, reason_text, is_serious_violation, reviewed_by, notice_sent_at, effective_at)
  values (p_company_id, p_kind, 'admin', reason, p_serious, (select auth.uid()), now(), effective)
  returning id into decided;
  insert into public.audit_log (actor_id, action, entity, entity_id, note)
  values ((select auth.uid()), 'suspend', 'suspension', decided, left(reason, 1000));
  return decided;
end;
$$;

/** Lifts a decision (it stops applying now), with a note for the record. */
create function public.admin_lift_suspension(p_suspension_id uuid, p_note text)
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
  update public.suspensions set lifted_at = now() where id = p_suspension_id and lifted_at is null;
  if not found then
    raise exception 'not_in_force' using errcode = '22023';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, note)
  values ((select auth.uid()), 'lift', 'suspension', p_suspension_id, left(note, 1000));
end;
$$;

/** Decides an appeal: upheld lifts the decision; either way the mover reads the reason (10+ characters). */
create function public.admin_decide_appeal(p_appeal_id uuid, p_upheld boolean, p_reason text)
returns public.appeal_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.mover_appeals;
  reason text := btrim(coalesce(p_reason, ''));
  decided public.appeal_status := case when p_upheld then 'upheld' else 'rejected' end;
begin
  if not public.is_admin() then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if char_length(reason) < 10 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into a from public.mover_appeals where id = p_appeal_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if a.status not in ('open', 'under_review') then
    raise exception 'already_decided' using errcode = '22023';
  end if;
  update public.mover_appeals
  set status = decided, reviewed_by = (select auth.uid()), decision_reason = reason, resolved_at = now()
  where id = p_appeal_id;
  if p_upheld and a.suspension_id is not null then
    update public.suspensions set lifted_at = now() where id = a.suspension_id and lifted_at is null;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, note)
  values ((select auth.uid()), case when p_upheld then 'uphold' else 'dismiss' end, 'appeal', p_appeal_id, left(reason, 1000));
  return decided;
end;
$$;

revoke execute on function public.admin_decide_suspension(uuid, public.suspension_kind, text, boolean, timestamptz) from public, anon;
revoke execute on function public.admin_lift_suspension(uuid, text) from public, anon;
revoke execute on function public.admin_decide_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_suspension(uuid, public.suspension_kind, text, boolean, timestamptz) to authenticated;
grant execute on function public.admin_lift_suspension(uuid, text) to authenticated;
grant execute on function public.admin_decide_appeal(uuid, boolean, text) to authenticated;
