-- Reminders before a mover's documents end (COMPLIANCE §5: "send reminders 30/14/3 days before expiry";
-- design/DECISIONS.md #30). A daily job records each reminder once, in `mover_reminders`: 30, 14 and
-- 3 days before the end date, and on the day it ended. The app shows the unread ones on the mover's
-- home; email and push (once there is an email provider and the app is in the stores) send from the
-- same rows (`emailed_at`, `pushed_at`). A new upload — a new end date — starts over; reminders for the
-- old date are removed. Test movers get none.

create type public.mover_reminder_kind as enum ('document_ending', 'document_ended');

create table public.mover_reminders (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.mover_companies (id) on delete cascade,
  -- The company's owner when the reminder was made: whom it is for.
  user_id        uuid not null references public.profiles (id) on delete cascade,
  document_id    uuid not null references public.mover_documents (id) on delete cascade,
  document_type  public.mover_document_type not null,
  kind           public.mover_reminder_kind not null,
  -- 30, 14 or 3 days before the end date; 0 = it has ended.
  days_before    smallint not null check (days_before in (0, 3, 14, 30)),
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  read_at        timestamptz,
  emailed_at     timestamptz,
  pushed_at      timestamptz,
  unique (document_id, expires_at, days_before)
);

create index mover_reminders_user_id_idx on public.mover_reminders (user_id) where read_at is null;

alter table public.mover_reminders enable row level security;
revoke all on public.mover_reminders from anon, authenticated;
grant select on public.mover_reminders to authenticated;
-- The mover only marks a reminder read.
grant update (read_at) on public.mover_reminders to authenticated;
grant all on public.mover_reminders to service_role;

create policy "mover_reminders: owners read theirs" on public.mover_reminders for select to authenticated
using (user_id = (select auth.uid()));
create policy "mover_reminders: owners mark theirs read" on public.mover_reminders for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/**
 * Records the reminders due on `p_now` (default: now) and returns how many it added. Each document
 * with an end date gets the reminder of the stage it is in — the nearest of 30, 14, 3 days before, or
 * 0 once ended — once per end date (a document uploaded 10 days before its end gets the 14-day one,
 * not the 30-day one as well). Run daily by pg_cron; service role only.
 */
create function public.queue_document_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  -- Reminders about an end date the document no longer has (a new one was uploaded) are not true any more.
  delete from public.mover_reminders r
  using public.mover_documents d
  where d.id = r.document_id and d.expires_at is distinct from r.expires_at;

  insert into public.mover_reminders (company_id, user_id, document_id, document_type, kind, days_before, expires_at)
  select d.company_id, c.owner_id, d.id, d.type,
         (case when stage.days = 0 then 'document_ended' else 'document_ending' end)::public.mover_reminder_kind,
         stage.days, d.expires_at
  from public.mover_documents d
  join public.mover_companies c on c.id = d.company_id
  cross join lateral (
    select case
      when d.expires_at <= p_now then 0
      when d.expires_at <= p_now + interval '3 days' then 3
      when d.expires_at <= p_now + interval '14 days' then 14
      when d.expires_at <= p_now + interval '30 days' then 30
    end as days
  ) as stage
  where d.expires_at is not null
    and stage.days is not null
    and not c.is_test
  on conflict (document_id, expires_at, days_before) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

revoke execute on function public.queue_document_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.queue_document_reminders(timestamptz) to service_role;

comment on function public.queue_document_reminders(timestamptz) is
  'Records the document reminders due (30/14/3 days before the end date, and on the day it ended — COMPLIANCE §5). Run daily by pg_cron; service role only.';

-- Every morning (UTC), before the working day in every market.
select cron.schedule('queue-document-reminders', '7 5 * * *', 'select public.queue_document_reminders()');
