-- Launch waitlist (landing page footer). Anyone may add an email; nobody can read the list
-- through the API — it is exported by an admin via the service role. Retention: see
-- packages/shared/src/retention.config.ts (`waitlist`).

create table public.waitlist (
  id          bigint generated always as identity primary key,
  email       text not null
              check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  locale      public.app_locale not null default 'en',
  created_at  timestamptz not null default now()
);

comment on table public.waitlist is 'Launch waitlist. Insert-only via API; used once to announce launch (GDPR: purpose-limited).';

-- One row per address, case-insensitive.
create unique index waitlist_email_key on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

revoke all on public.waitlist from anon, authenticated;
grant insert (email, locale) on public.waitlist to anon, authenticated;

create policy "waitlist: anyone can join"
on public.waitlist for insert
to anon, authenticated
with check (true);
