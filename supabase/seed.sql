-- Local dev seed. No accounts: sign-in is email + password in the app and on the website
-- (design/DECISIONS.md #17, #29). Create one with "Create account" — the 6-digit code arrives in Mailpit
-- (http://127.0.0.1:54324) — then choose a password. The role (customer or mover) is saved after the code
-- (public.choose_role) and can be switched later.
-- Sample movers, vehicles and rate cards come from migration 20261012091000_test_movers.sql (is_test).
select 1;
