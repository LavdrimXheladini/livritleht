-- Refines 20261013120000_password_after_proof: only the first proof by a code or link that was emailed or
-- texted clears the password (Supabase Auth checks codes against confirmation_sent_at / recovery_sent_at).
-- A login an admin creates already confirmed (dashboard "Add user" with "Auto Confirm User", or
-- auth.admin.createUser with email_confirm) keeps the password the admin set: no code was sent, so no one
-- could have planted it. Admin tools on a login that was sent a code: confirm it first, then set its
-- password (not both in one update).

create or replace function public.clear_password_on_first_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null
     and old.phone_confirmed_at is null
     and (new.email_confirmed_at is not null or new.phone_confirmed_at is not null)
     and (old.confirmation_sent_at is not null or old.recovery_sent_at is not null) then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_password_on_first_proof() from public, anon, authenticated;
