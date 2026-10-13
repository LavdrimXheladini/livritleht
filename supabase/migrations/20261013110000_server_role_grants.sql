-- The server role (edge functions, the website's server, later the admin panel) bypasses RLS and
-- reads and writes every table. Older Supabase projects, like the cloud one, grant it that
-- implicitly on every new table; newer projects and the local stack (Supabase CLI 2.x) don't — there
-- the quote function failed with "permission denied for table vehicles". Explicit from now on, for
-- the existing tables and for every table later migrations create. The app's roles (anon,
-- authenticated) keep exactly the grants each migration gives them.

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
