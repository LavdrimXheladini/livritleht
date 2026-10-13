begin;
select plan(3);

-- The server role itself (edge functions and the website's server use it) — not the database owner
-- the other tests switch back to with `reset role`.

select is(
  (select string_agg(c.relname, ', ' order by c.relname)
   from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and not (has_table_privilege('service_role', c.oid, 'select')
          and has_table_privilege('service_role', c.oid, 'insert')
          and has_table_privilege('service_role', c.oid, 'update')
          and has_table_privilege('service_role', c.oid, 'delete'))),
  null, 'the server role can read and write every table');

-- A table a later migration creates gets the same rights.
create table public.server_role_test_later (id integer);
select ok(has_table_privilege('service_role', 'public.server_role_test_later', 'select')
      and has_table_privilege('service_role', 'public.server_role_test_later', 'insert'),
  'and so can it on tables created later');
drop table public.server_role_test_later;

set local role service_role;
-- Postgres checks the rights on every table the lookup reads, whether or not a row matches.
select lives_ok(
  $$ select * from public.quotable_vehicles('SRID=4326;POINT(21.1655 42.6629)', 'XK', 'XK', 'VAN', true, now()) $$,
  'the quote function''s lookup works as the server role');
reset role;

select * from finish();
rollback;
