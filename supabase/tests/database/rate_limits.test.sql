begin;
select plan(21);

-- Per-IP rate limits (public.hit_rate_limit): fixed windows, hashed keys, server only.
select has_table('public', 'rate_limits', 'rate_limits table exists');
select is((select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'rate_limits'),
  true, 'RLS is enabled on rate_limits');

-- The server (service role) counts requests ---------------------------------------------------
set local role service_role;
select is(public.hit_rate_limit('test:203.0.113.9', 3, 60), true, 'the first request is allowed');
select is(public.hit_rate_limit('test:203.0.113.9', 3, 60), true, 'the second request is allowed');
select is(public.hit_rate_limit('test:203.0.113.9', 3, 60), true, 'requests up to the limit are allowed');
select is(public.hit_rate_limit('test:203.0.113.9', 3, 60), false, 'the request after the limit is blocked');
select is(public.hit_rate_limit('test:203.0.113.9', 3, 60), false, 'it stays blocked while the window lasts');
select is(public.hit_rate_limit('test:198.51.100.1', 3, 60), true, 'another address has its own budget');
reset role;

-- The window passes (time stands still inside a test transaction, so the counter is aged instead).
update public.rate_limits set window_start = window_start - interval '61 seconds'
where key = encode(sha256(convert_to('test:203.0.113.9', 'UTF8')), 'hex');
select is(public.hit_rate_limit('test:203.0.113.9', 3, 60), true, 'once the window has passed, requests are allowed again');
select is((select rl.count from public.rate_limits rl where rl.key = encode(sha256(convert_to('test:203.0.113.9', 'UTF8')), 'hex')),
  1, 'the new window counts from one');

select is((select count(*)::int from public.rate_limits where key like '%203.0.113%' or key like 'test:%'),
  0, 'addresses are stored only as hashes (COMPLIANCE §9)');

insert into public.rate_limits (key, window_start, count) values ('stale-test-row', now() - interval '25 hours', 5);
select ok(public.hit_rate_limit('test:198.51.100.2', 3, 60), 'a fresh address is allowed');
select is((select count(*)::int from public.rate_limits where key = 'stale-test-row'),
  0, 'counters older than a day are deleted (retention.config: rate_limits)');

select throws_ok($$ select public.hit_rate_limit('test:x', 0, 60) $$, '22023', null, 'a limit below one is rejected');
select throws_ok($$ select public.hit_rate_limit('', 3, 60) $$, '22023', null, 'an empty key is rejected');
select throws_ok($$ select public.hit_rate_limit('test:x', 3, 0) $$, '22023', null, 'a window below one second is rejected');

-- No client can use it or see it -----------------------------------------------------------
set local role anon;
select throws_ok($$ select public.hit_rate_limit('test:203.0.113.9', 3, 60) $$, '42501', null, 'visitors cannot call hit_rate_limit');
select throws_ok($$ select * from public.rate_limits $$, '42501', null, 'visitors cannot read the counters');
select throws_ok($$ delete from public.rate_limits $$, '42501', null, 'visitors cannot reset the counters');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c501","role":"authenticated"}', true);
select throws_ok($$ select public.hit_rate_limit('test:203.0.113.9', 1000, 60) $$, '42501', null, 'signed-in users cannot call hit_rate_limit');
select throws_ok($$ select * from public.rate_limits $$, '42501', null, 'signed-in users cannot read the counters');

select * from finish();
rollback;
