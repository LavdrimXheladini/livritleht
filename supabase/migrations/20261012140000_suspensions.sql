-- Suspensions: restrictions, suspensions and terminations of mover companies (CLAUDE.md §3,
-- COMPLIANCE §3, P2B Regulation 2019/1150). The database enforces the parts that must never slip:
--   - every decision has a written reason;
--   - an algorithm (or a customer report) may only FLAG: nothing takes effect until a human admin
--     has reviewed it;
--   - the mover is told the reasons no later than when it takes effect, and a termination takes
--     effect at least 30 days after that notice, unless it is a serious violation.
-- Written by the platform only (service role: admin tools). The mover reads their own once notified.
-- Notices, appeals (mover_appeals) and the admin screens come with build step 9.

create type public.suspension_kind as enum ('restriction', 'suspension', 'termination');
create type public.suspension_flag_source as enum ('algorithm', 'customer_report', 'admin');

create table public.suspensions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.mover_companies (id) on delete cascade,
  kind                  public.suspension_kind not null,
  flagged_by            public.suspension_flag_source not null,
  -- The written statement of reasons the mover receives (COMPLIANCE §3).
  reason_text           text not null check (btrim(reason_text) <> '' and char_length(reason_text) <= 4000),
  -- Fraud, illegal activity, repeated serious breaches: no 30-day notice for a termination.
  is_serious_violation  boolean not null default false,
  -- The human admin who reviewed the flag. Required before it takes effect.
  reviewed_by           uuid references public.profiles (id) on delete restrict,
  notice_sent_at        timestamptz,
  effective_at          timestamptz,
  lifted_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint suspensions_reviewed_before_effect check (effective_at is null or reviewed_by is not null),
  constraint suspensions_notice_before_effect check (
    effective_at is null or (notice_sent_at is not null and effective_at >= notice_sent_at)
  ),
  constraint suspensions_termination_notice_period check (
    kind <> 'termination' or is_serious_violation or effective_at is null
    or effective_at >= notice_sent_at + interval '30 days'
  )
);

comment on table public.suspensions is
  'Restrictions, suspensions and terminations of mover companies (COMPLIANCE §3). Only a human-reviewed row takes effect. Written by the service role only.';

create index suspensions_company_id_idx on public.suspensions (company_id);

create trigger suspensions_set_updated_at before update on public.suspensions
for each row execute function public.set_updated_at();

-- The reviewer must be an admin: a mover (or anyone else) can never "review" a decision.
create function public.suspensions_check_reviewer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reviewed_by is not null
     and not exists (select 1 from public.profiles p where p.id = new.reviewed_by and p.role = 'admin') then
    raise exception 'suspensions: reviewed_by must be an admin' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger suspensions_check_reviewer before insert or update on public.suspensions
for each row execute function public.suspensions_check_reviewer();

revoke execute on function public.suspensions_check_reviewer() from public, anon, authenticated;

-- Privileges + RLS: the mover reads their own company's decisions once they have been notified;
-- nobody writes from the client.
alter table public.suspensions enable row level security;

revoke all on public.suspensions from anon, authenticated;
grant select on public.suspensions to authenticated;

create policy "suspensions: owner reads notified decisions"
on public.suspensions for select to authenticated
using (
  notice_sent_at is not null
  and exists (select 1 from public.mover_companies c where c.id = company_id and c.owner_id = (select auth.uid()))
);
