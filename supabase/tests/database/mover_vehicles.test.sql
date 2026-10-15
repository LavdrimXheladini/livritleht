begin;
select plan(11);

-- Fixtures: two movers, the first with a company (written as the service role).
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d501', 'mover-d501@example.com', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d502', 'mover-d502@example.com', '{"locale":"sq"}');
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d501', '00000000-0000-0000-0000-00000000d502');
insert into public.mover_companies (id, owner_id, legal_name, country)
values ('00000000-0000-0000-0000-0000000af501', '00000000-0000-0000-0000-00000000d501', 'Lëvizje Shpk', 'XK');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d501","role":"authenticated"}', true);

-- What the app's form saves (vehicleColumns).
select lives_ok(
  $$ insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, has_tail_lift, tachograph)
     values ('00000000-0000-0000-0000-0000000be501', '00000000-0000-0000-0000-0000000af501', 'VAN', '01-234 AB', 2800, 6.5, false, true) $$,
  'a mover adds a van');
select is((select verified_at from public.vehicles where id = '00000000-0000-0000-0000-0000000be501'), null,
  'a new van waits for the check');

select throws_ok(
  $$ insert into public.vehicles (company_id, class, plate, max_weight_kg, volume_m3) values ('00000000-0000-0000-0000-0000000af501', 'LARGE_VAN', '01-555 CD', 4200, 14) $$,
  '23514', null, 'only a truck is over 3.5 t');
select throws_ok(
  $$ insert into public.vehicles (company_id, class, plate, max_weight_kg, volume_m3) values ('00000000-0000-0000-0000-0000000af501', 'TRUCK', '01-556 CD', 3500, 30) $$,
  '23514', null, 'a truck is over 3.5 t');
select throws_ok(
  $$ insert into public.vehicles (company_id, class, plate, volume_m3) values ('00000000-0000-0000-0000-0000000af501', 'VAN', '01-557 CD', 6) $$,
  '22023', 'vehicle_weight_required', 'the weight is required');
select throws_ok(
  $$ insert into public.vehicles (company_id, class, plate, max_weight_kg) values ('00000000-0000-0000-0000-0000000af501', 'VAN', '01-558 CD', 2800) $$,
  '22023', 'vehicle_volume_required', 'the load volume is required');
select throws_ok(
  $$ insert into public.vehicles (company_id, class, plate, max_weight_kg, volume_m3) values ('00000000-0000-0000-0000-0000000af501', 'VAN', '01-559 cd', 2800, 6) $$,
  '22023', 'vehicle_plate_invalid', 'plates are stored in capitals, as written on the vehicle');

select lives_ok(
  $$ insert into public.vehicles (id, company_id, class, plate, max_weight_kg, volume_m3, tachograph)
     values ('00000000-0000-0000-0000-0000000be502', '00000000-0000-0000-0000-0000000af501', 'SMALL', '01-777 EF', 2200, 3, true) $$,
  'a small van is added');
select is((select tachograph from public.vehicles where id = '00000000-0000-0000-0000-0000000be502'), false,
  'no tachograph is kept for a van up to 2.5 t');

-- Checked by an admin; taking it out of use keeps the check.
reset role;
update public.vehicles set verified_at = now() where id = '00000000-0000-0000-0000-0000000be501';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d501","role":"authenticated"}', true);
update public.vehicles set active = false where id = '00000000-0000-0000-0000-0000000be501';
select isnt((select verified_at from public.vehicles where id = '00000000-0000-0000-0000-0000000be501'), null,
  'taking a van out of use keeps its check');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d502","role":"authenticated"}', true);
select is((select count(*)::int from public.vehicles where company_id = '00000000-0000-0000-0000-0000000af501'), 0,
  'another mover sees none of those vans');

select * from finish();
rollback;
