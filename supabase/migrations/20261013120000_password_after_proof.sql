-- A password chosen before the address was proven must not survive its confirmation (design/DECISIONS.md
-- #17). Anyone can call /auth/v1/signup with someone else's email and a password of their choice; Supabase
-- Auth keeps that password on the unconfirmed login, and when the real owner later confirms the address
-- with a code, the planted password would still sign in. So the first proof of a contact (email or phone)
-- clears the password; the app then asks the owner for their own (every sign-in by code ends with
-- choosing a password). Passwords set after that — by the owner, in the app — are untouched.
-- Admin tools: confirm a login first, then set its password (not both in one update).

create function public.clear_password_on_first_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null
     and old.phone_confirmed_at is null
     and (new.email_confirmed_at is not null or new.phone_confirmed_at is not null) then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_password_on_first_proof() from public, anon, authenticated;

create trigger clear_password_on_first_proof
  before update on auth.users
  for each row execute function public.clear_password_on_first_proof();
