-- Logins whose email code was never entered (COMPLIANCE §9, data minimisation). Asking for a code
-- creates the login (auth.users) and its profile, so an address someone typed — a typo, or someone
-- else's address — would otherwise be kept for good. They are deleted 7 days after the last code was
-- sent (retention.config: `unconfirmed_accounts`). A code is valid for an hour at most, so nobody is
-- in the middle of signing in. Deleting the login deletes its profile (on delete cascade), and the
-- rows of Supabase Auth's audit log that name it go too (they have no link to the login).
-- COMPLIANCE-TODO: §14 — the lawyer confirms the 7 days.
--
-- Needs email confirmation ON (Authentication → Sign In / Providers → Email → "Confirm email" in the
-- cloud project; `[auth.email] enable_confirmations` in config.toml): without it Supabase marks a
-- new address confirmed as soon as the code is asked for, and this cleanup would find nothing.

create extension if not exists pg_cron;

create function public.delete_unconfirmed_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_deleted uuid[] := '{}';
begin
  for v_id in
    select u.id
    from auth.users u
    where u.email_confirmed_at is null
      and u.phone_confirmed_at is null
      and u.last_sign_in_at is null
      and u.invited_at is null
      -- A new code (sign-up or sign-in) restarts the 7 days.
      and greatest(u.created_at, u.confirmation_sent_at, u.recovery_sent_at) < now() - interval '7 days'
    order by u.created_at
    limit 1000
  loop
    begin
      -- Checked again at the delete: a code asked for while this runs keeps the login.
      delete from auth.users u
      where u.id = v_id
        and u.email_confirmed_at is null
        and u.phone_confirmed_at is null
        and u.last_sign_in_at is null
        and u.invited_at is null
        and greatest(u.created_at, u.confirmation_sent_at, u.recovery_sent_at) < now() - interval '7 days';
      if found then
        v_deleted := v_deleted || v_id;
      end if;
    exception when foreign_key_violation then
      -- Something the platform made for this login (e.g. a mover company) keeps it, for a person to look at.
      null;
    end;
  end loop;

  -- Each code request was logged with the typed address (actor_username).
  delete from auth.audit_log_entries where payload ->> 'actor_id' = any (v_deleted::text[]);

  return cardinality(v_deleted);
end;
$$;

comment on function public.delete_unconfirmed_accounts() is
  'Deletes logins whose email code was never entered, 7 days after the last code (retention.config unconfirmed_accounts), with their Auth audit-log rows. Run nightly by pg_cron; service role only. Needs "Confirm email" on.';

revoke execute on function public.delete_unconfirmed_accounts() from public, anon, authenticated;

-- Every night at 03:17 UTC (rescheduling by the same name replaces the job).
select cron.schedule('delete-unconfirmed-accounts', '17 3 * * *', 'select public.delete_unconfirmed_accounts()');
