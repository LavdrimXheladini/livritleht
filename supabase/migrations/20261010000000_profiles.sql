-- Profiles: one row per auth user. Created by trigger on sign-up; role is never client-editable.
-- Enum values mirror packages/shared/src/constants.ts.

create type public.user_role as enum ('customer', 'mover', 'admin');
create type public.app_locale as enum ('en', 'sq', 'pl', 'sr');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role   not null default 'customer',
  name        text check (char_length(name) between 1 and 120),
  phone       text,
  locale      public.app_locale  not null default 'en',
  created_at  timestamptz        not null default now(),
  updated_at  timestamptz        not null default now()
);

comment on table public.profiles is 'App profile per auth user. Role set only by sign-up trigger or service role.';

-- updated_at ---------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Sign-up trigger ----------------------------------------------------------
-- Metadata comes from the client (supabase.auth.signInWithOtp({ options: { data } })),
-- so it is untrusted: only `customer` / `mover` are accepted, never `admin`.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role   text := new.raw_user_meta_data ->> 'role';
  requested_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (id, role, phone, locale)
  values (
    new.id,
    case when requested_role in ('customer', 'mover')
         then requested_role::public.user_role
         else 'customer' end,
    nullif(new.phone, ''),
    case when requested_locale in ('en', 'sq', 'pl', 'sr')
         then requested_locale::public.app_locale
         else 'en' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Keep profile phone in sync when the user verifies a new number.
create function public.handle_user_phone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set phone = nullif(new.phone, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_phone_changed
after update of phone on auth.users
for each row
when (old.phone is distinct from new.phone)
execute function public.handle_user_phone_change();

-- Privileges + RLS -----------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, locale) on public.profiles to authenticated;

create policy "profiles: read own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles: update own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_phone_change() from public, anon, authenticated;
