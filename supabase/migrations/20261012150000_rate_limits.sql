-- Per-IP rate limits for the anonymous endpoints (quote, address search). Each request costs a call
-- to a free, fair-use OpenStreetMap service (OSRM demo server, Photon) — abuse would get us banned —
-- and database lookups. Limits live in packages/shared/src/rate-limit.ts (RATE_LIMITS).
--
-- Fixed windows per key. The key (e.g. `quote:203.0.113.7`) is stored only as a SHA-256 hash, and
-- rows are deleted a day after their window started (retention.config: rate_limits), since IP
-- addresses are personal data (COMPLIANCE §9). Server only: no client can call it or read the table.

create table public.rate_limits (
  key           text primary key,  -- sha256 of the caller's key, hex
  window_start  timestamptz not null,
  count         integer not null check (count >= 1)
);

comment on table public.rate_limits is
  'Request counters per hashed key (public.hit_rate_limit). Service role only; rows live at most a day.';

create index rate_limits_window_start_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one request for `p_key`; true while it is within `p_limit` requests per `p_window_seconds`.
-- Blocked requests count too, so hammering doesn't open the window sooner.
create function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window interval;
  v_count  integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 200
     or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'hit_rate_limit: invalid arguments' using errcode = '22023';
  end if;
  v_window := make_interval(secs => p_window_seconds);

  insert into public.rate_limits as rl (key, window_start, count)
  values (encode(sha256(convert_to(p_key, 'UTF8')), 'hex'), now(), 1)
  on conflict (key) do update
    set window_start = case when rl.window_start <= now() - v_window then now() else rl.window_start end,
        count        = case when rl.window_start <= now() - v_window then 1 else rl.count + 1 end
  returning rl.count into v_count;

  -- Retention: counters are useless after their window (at most a day).
  delete from public.rate_limits where window_start < now() - interval '1 day';

  return v_count <= p_limit;
end;
$$;

revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
