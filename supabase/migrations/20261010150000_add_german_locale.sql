-- German UI for the diaspora corridors (DE/AT/CH ↔ Balkans). Mirrors LOCALES in packages/shared.

alter type public.app_locale add value if not exists 'de';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role   text := new.raw_user_meta_data ->> 'role';
  requested_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (id, role, phone, locale)
  values (
    new.id,
    case when requested_role in ('customer', 'mover')
         then requested_role::public.user_role
         else 'customer' end,
    nullif(new.phone, ''),
    case when requested_locale in ('en', 'sq', 'pl', 'sr', 'de')
         then requested_locale::public.app_locale
         else 'en' end
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
