begin;
select plan(19);

-- Fixtures: two movers and a customer (profiles via the sign-up trigger; roles set directly), and the
-- phone numbers the phone-verification function confirmed for the first mover.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000d301', 'mover-d301@example.com', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000d302', 'mover-d302@example.com', '{"locale":"sq"}'),
  ('00000000-0000-0000-0000-00000000c301', 'customer-c301@example.com', '{"locale":"sq"}');
update public.profiles set role = 'mover' where id in ('00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000d302');
update public.profiles set role = 'customer' where id = '00000000-0000-0000-0000-00000000c301';
insert into public.phone_verifications (user_id, phone, channel)
values
  ('00000000-0000-0000-0000-00000000d301', '+38344123456', 'sms'),
  ('00000000-0000-0000-0000-00000000d301', '+38349123456', 'whatsapp');
insert into public.company_registry_checks (user_id, country, tax_id, register, result, typed_name, registered_name)
values ('00000000-0000-0000-0000-00000000d301', 'PL', '7740001454', 'pl-white-list', 'match', 'Orlen', 'ORLEN SPÓŁKA AKCYJNA');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d301","role":"authenticated"}', true);

-- What the app's form saves (moverCompanyColumns), with a self-certification time from the device.
select lives_ok(
  $$ insert into public.mover_companies (id, owner_id, is_business, legal_name, registration_no, tax_id, country,
       tax_residency_country, address, address_point, address_details, contact_phone, contact_email, self_certification_at)
     values ('00000000-0000-0000-0000-0000000ae001', '00000000-0000-0000-0000-00000000d301', true, 'Lëvizje Shpk',
       '810123456', '601234567', 'XK', 'XK', 'Rr. Agim Ramadani 12, 10000 Prishtinë', 'SRID=4326;POINT(21.1655 42.6629)',
       '{"street":"Rr. Agim Ramadani","houseNumber":"12","postcode":"10000","city":"Prishtinë","countryCode":"XK","lat":42.6629,"lon":21.1655}',
       '+38344123456', 'info@levizje.example', '2001-01-01T00:00:00Z') $$,
  'a mover saves the company form');

select ok((select self_certification_at > now() - interval '1 minute' from public.mover_companies
           where id = '00000000-0000-0000-0000-0000000ae001'),
  'the self-certification is dated by the server, not by the device');

select is((select verification_status::text from public.mover_companies where id = '00000000-0000-0000-0000-0000000ae001'),
  'pending', 'a new company waits for verification');

update public.mover_companies set self_certification_at = '2030-01-01T00:00:00Z', contact_email = 'hello@levizje.example'
where id = '00000000-0000-0000-0000-0000000ae001';
select ok((select self_certification_at < now() + interval '1 minute' from public.mover_companies
           where id = '00000000-0000-0000-0000-0000000ae001'),
  'a later save keeps the first self-certification time');

-- The phone: only numbers the mover confirmed with a code.
select throws_ok(
  $$ update public.mover_companies set contact_phone = '+38345999999' where id = '00000000-0000-0000-0000-0000000ae001' $$,
  '22023', 'contact_phone_not_confirmed', 'a phone number not confirmed with a code is refused');
select lives_ok(
  $$ update public.mover_companies set contact_phone = '+38349123456' where id = '00000000-0000-0000-0000-0000000ae001' $$,
  'another number the mover confirmed is accepted');

-- The address: from the map search, in the country of registration.
select throws_ok(
  $$ update public.mover_companies set address = 'Somewhere 1, Prishtinë', address_point = null
     where id = '00000000-0000-0000-0000-0000000ae001' $$,
  '22023', 'address_not_located', 'an address without its point on the map is refused');
select throws_ok(
  $$ update public.mover_companies set country = 'AL', tax_residency_country = 'AL'
     where id = '00000000-0000-0000-0000-0000000ae001' $$,
  '22023', 'address_not_located', 'the address must be in the country of registration');
select lives_ok(
  $$ update public.mover_companies set address = 'Rr. Nënë Tereza 5, 10000 Prishtinë', address_point = 'SRID=4326;POINT(21.16 42.66)',
       address_details = '{"street":"Rr. Nënë Tereza","houseNumber":"5","postcode":"10000","city":"Prishtinë","countryCode":"XK","lat":42.66,"lon":21.16}'
     where id = '00000000-0000-0000-0000-0000000ae001' $$,
  'a new address chosen on the map is accepted');

-- An admin verifies it (service role: no auth.uid()).
reset role;
update public.mover_companies set verification_status = 'verified' where id = '00000000-0000-0000-0000-0000000ae001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d301","role":"authenticated"}', true);

update public.mover_companies set contact_phone = '+38344123456' where id = '00000000-0000-0000-0000-0000000ae001';
select is((select verification_status::text from public.mover_companies where id = '00000000-0000-0000-0000-0000000ae001'),
  'verified', 'a new confirmed phone number keeps the company verified');

update public.mover_companies set is_business = false, registration_no = null where id = '00000000-0000-0000-0000-0000000ae001';
select is((select verification_status::text from public.mover_companies where id = '00000000-0000-0000-0000-0000000ae001'),
  'pending', 'switching to private individual sends the company back to verification (COMPLIANCE §5)');

-- Confirmed phones and register answers: the owner reads them; nobody writes them from the app.
select is((select count(*)::int from public.phone_verifications), 2, 'a mover reads their confirmed phone numbers');
select is((select count(*)::int from public.company_registry_checks), 1, 'a mover reads what the registers said about their number');
select throws_ok(
  $$ insert into public.phone_verifications (user_id, phone, channel) values ('00000000-0000-0000-0000-00000000d301', '+38345999999', 'test') $$,
  '42501', null, 'a mover cannot mark a phone number as confirmed');
select throws_ok(
  $$ insert into public.company_registry_checks (user_id, country, tax_id, register, result, typed_name)
     values ('00000000-0000-0000-0000-00000000d301', 'PL', '5260250995', 'vies', 'match', 'Mine') $$,
  '42501', null, 'a mover cannot write a register answer');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d302","role":"authenticated"}', true);
select is((select count(*)::int from public.phone_verifications), 0, 'another mover does not see those phone numbers');
select throws_ok(
  $$ insert into public.mover_companies (owner_id, legal_name, country, contact_phone)
     values ('00000000-0000-0000-0000-00000000d302', 'Borrowed phone', 'XK', '+38344123456') $$,
  '22023', 'contact_phone_not_confirmed', 'a phone another mover confirmed does not count');

-- A customer has no company form.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c301","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.mover_companies (owner_id, legal_name, country)
     values ('00000000-0000-0000-0000-00000000c301', 'Not a mover', 'XK') $$,
  '42501', null, 'a customer cannot register a company');
select is((select count(*)::int from public.mover_companies where owner_id = '00000000-0000-0000-0000-00000000d301'), 0,
  'a customer cannot read a mover''s company details');

select * from finish();
rollback;
