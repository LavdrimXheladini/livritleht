-- The role (customer or mover) is chosen by the verified owner of the account after the first
-- sign-in, and they can switch sides later (design/DECISIONS.md #15). It is no longer taken from the
-- sign-up metadata:
-- - anyone can send that metadata for any email before the email is proven (and so pre-register
--   someone else's address as a mover or a customer);
-- - for an email that already has an account, the code request ignores it, so a different choice
--   used to be dropped silently.
-- NULL = not chosen yet: the app asks after the code (public.choose_role). Existing profiles keep
-- their role. `admin` is still granted only by the service role.

alter table public.profiles alter column role drop default;
alter table public.profiles alter column role drop not null;

comment on table public.profiles is
  'App profile per auth user, created by the sign-up trigger. The role is chosen by the user after the first sign-in and can be switched between customer and mover (public.choose_role); admin only by the service role.';

comment on column public.profiles.role is
  'customer or mover, chosen by the user after the first sign-in and switchable later (public.choose_role); admin only by the service role. NULL = not chosen yet.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_locale text := new.raw_user_meta_data ->> 'locale';
begin
  -- No role here: the user chooses it after signing in (public.choose_role).
  insert into public.profiles (id, phone, locale)
  values (
    new.id,
    nullif(new.phone, ''),
    case when requested_locale in ('en', 'sq', 'pl', 'sr', 'de')
         then requested_locale::public.app_locale
         else 'en' end
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- The signed-in user chooses their side, customer or mover: first after signing in, and later to
-- switch sides (owner decision 2026-10-13). Never admin, and an admin can't switch here. Switching to
-- mover gives no work by itself: a mover is offered jobs only once their company, documents, vans and
-- rates are filled in and verified (public.quotable_vehicles).
create function public.choose_role(p_role public.user_role)
returns public.user_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  if (select auth.uid()) is null then
    raise exception 'choose_role: sign in first' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('customer', 'mover') then
    raise exception 'choose_role: customer or mover only' using errcode = '22023';
  end if;
  update public.profiles
  set role = p_role
  where id = (select auth.uid()) and (role is null or role in ('customer', 'mover'))
  returning role into v_role;
  if v_role is null then
    raise exception 'choose_role: an admin''s role is set by the platform' using errcode = '55000';
  end if;
  return v_role;
end;
$$;

revoke execute on function public.choose_role(public.user_role) from public, anon;
grant execute on function public.choose_role(public.user_role) to authenticated;
