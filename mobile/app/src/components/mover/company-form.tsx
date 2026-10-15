import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import {
  MOVER_COUNTRIES,
  REGISTRATION_KINDS,
  TAX_ID_KINDS,
  idHint,
  moverCompanyFormDefaults,
  moverCompanyFormSchema,
  type MoverCompanyForm,
  type MoverCompanyFormInput,
  type MoverCompanyRow,
  type MoverCountry,
} from '@movershub/shared';
import { Button, Checkbox, ChipGroup, DarkPanel, Display, Screen, TextField, announce, useAnnouncement, useAuth } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { useCompanyRegistry, useConfirmedPhones } from '@/lib/company-checks';
import { useMoverCompany, useSaveMoverCompany } from '@/lib/mover-company';

import { CompanyAddressPicker } from './company-address';
import { PhoneCode } from './phone-code';

const COMPANY_ERRORS = [
  'legal_name_required',
  'registration_no_required',
  'registration_no_format',
  'tax_id_required',
  'tax_id_format',
  'tax_id_not_found',
  'country_required',
  'address_required',
  'address_confirm',
  'address_wrong_country',
  'phone_not_confirmed',
  'self_certification_required',
  'too_long',
] as const;
type CompanyError = (typeof COMPANY_ERRORS)[number];
const isCompanyError = (m: string): m is CompanyError => (COMPANY_ERRORS as readonly string[]).includes(m);

/**
 * The schema's messages are i18n keys: this form's own, or the sign-in ones for phone and email.
 * `registeredName`: the register's name for the typed tax number, shown when it isn't the typed one.
 */
function useCompanyErrorText(registeredName: string) {
  const { t } = useTranslation();
  return (message: string | undefined) => {
    if (message === undefined) return undefined;
    if (message === 'tax_id_mismatch') return t('mover.company.errors.tax_id_mismatch', { name: registeredName });
    if (isCompanyError(message)) return t(`mover.company.errors.${message}`);
    if (message === 'invalid_phone' || message === 'invalid_email') return t(`auth.errors.${message}`);
    return t('common.errorGeneric');
  };
}

type Field = keyof MoverCompanyFormInput;
/** Top to bottom, for the summary read out after a failed attempt. */
const FIELDS: readonly Field[] = [
  'isBusiness',
  'country',
  'legalName',
  'registrationNo',
  'taxId',
  'taxResidencyCountry',
  'address',
  'contactPhone',
  'contactEmail',
  'selfCertified',
];

function goBack() {
  // Opened directly (e.g. a reload of the browser version on this screen): home is the way back.
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function BackLink() {
  const { t } = useTranslation();
  return <Button testID="company-back" variant="link-dark" className="self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={goBack} />;
}

/**
 * "Your company" (mover side, first step of the setup — COMPLIANCE §5): who the mover is, for
 * customers (§4: name, registration number, address and contact on every booking) and for tax
 * reporting (§10). Numbers are checked against their country's format and, where one exists, the
 * official register; the address comes from the map and is confirmed; the phone is confirmed with
 * a code (design/DECISIONS.md #19). Saving doesn't verify anything: MoversHub checks it with the
 * documents.
 */
export function CompanyScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const company = useMoverCompany();

  if (company.data !== undefined) return <CompanyForm row={company.data} email={session?.user.email ?? ''} />;
  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      <BackLink />
      {company.isError ? (
        <View className="gap-3">
          <Text className="font-sans text-base text-night-50">{t('mover.company.errorLoad')}</Text>
          <Button
            testID="company-retry"
            variant="accent"
            title={t('common.retry')}
            loading={company.isFetching}
            onPress={() => void company.refetch()}
          />
        </View>
      ) : (
        <ActivityIndicator color={colors.accent[300]} accessibilityLabel={t('common.loading')} />
      )}
    </Screen>
  );
}

function CompanyForm({ row, email }: { row: MoverCompanyRow | null; email: string }) {
  const { t } = useTranslation();
  const [registeredName, setRegisteredName] = useState('');
  const errorText = useCompanyErrorText(registeredName);
  const save = useSaveMoverCompany();
  const confirmedPhones = useConfirmedPhones();
  const checkRegistry = useCompanyRegistry();
  // One announcement per attempt: every field's error read together (they cut each other off on iOS).
  const [summary, setSummary] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useAnnouncement(summary, attempt);

  const form = useForm<MoverCompanyFormInput, unknown, MoverCompanyForm>({
    resolver: zodResolver(moverCompanyFormSchema),
    defaultValues: moverCompanyFormDefaults(row, email),
  });
  // useWatch, not form.watch: the React Compiler can't memoise around watch().
  const isBusiness = useWatch({ control: form.control, name: 'isBusiness' });
  const country = useWatch({ control: form.control, name: 'country' });
  const errors = form.formState.errors;
  const shownError = (name: Field) => errorText(errors[name]?.message);
  const countryName = (code: MoverCountry) => t(`common.countries.${code}`);

  // What each number looks like in the chosen country (official names, e.g. "NIP / PESEL").
  const taxHint = country ? idHint(TAX_ID_KINDS[country][isBusiness ? 'business' : 'person']) : null;
  const registration = country ? REGISTRATION_KINDS[country] : null;
  const registrationKinds = registration && registration.rule !== 'sameAsTax' ? registration.kinds : null;

  const label = (name: Field): string =>
    ({
      isBusiness: t('mover.company.kindLabel'),
      legalName: isBusiness ? t('mover.company.legalNameBusiness') : t('mover.company.legalNameIndividual'),
      registrationNo: registration?.rule === 'optional' ? t('mover.company.registrationOptional') : t('mover.company.registrationNo'),
      taxId: t('mover.company.taxId'),
      country: t('mover.company.country'),
      taxResidencyCountry: t('mover.company.taxResidency'),
      address: t('mover.company.address'),
      contactPhone: t('mover.company.phone'),
      contactEmail: t('mover.company.email'),
      selfCertified: t('mover.company.selfCertification'),
    })[name];

  const say = (text: string) => {
    setSummary(text);
    setAttempt((n) => n + 1);
  };
  const refuse = (name: Field, message: string) => {
    form.setError(name, { message }, { shouldFocus: true });
    say(`${t('mover.company.checkFields')} ${label(name)}: ${errorText(message) ?? ''}`);
  };

  const submit = form.handleSubmit(
    async (values) => {
      // 1. The phone is proven with a code (Postgres refuses it otherwise).
      if (!confirmedPhones.data?.includes(values.contactPhone)) return refuse('contactPhone', 'phone_not_confirmed');

      // 2. The official register, where there is one. No answer (offline, register down, limit) doesn't
      //    stop the save: MoversHub then checks the number by hand, like those of Kosovo, Albania and
      //    North Macedonia.
      const registry = await checkRegistry({
        country: values.country,
        isBusiness: values.isBusiness,
        taxId: values.taxId,
        legalName: values.legalName,
      });
      if (registry.ok && registry.data.result === 'mismatch') {
        setRegisteredName(registry.data.registeredName ?? '');
        return refuse('taxId', 'tax_id_mismatch');
      }
      if (registry.ok && registry.data.result === 'not_found' && registry.data.authoritative) return refuse('taxId', 'tax_id_not_found');
      if (!registry.ok && registry.error === 'invalid_number') return refuse('taxId', 'tax_id_format');

      // 3. Save. Postgres checks the phone and the address again.
      try {
        await save.mutateAsync({ form: values, companyId: row?.id ?? null });
      } catch (e) {
        const message = (e as { message?: string } | null)?.message ?? '';
        if (message.includes('contact_phone_not_confirmed')) return refuse('contactPhone', 'phone_not_confirmed');
        if (message.includes('address_not_located')) return refuse('address', 'address_wrong_country');
        form.setError('root', { message: 'save' });
        say(t('mover.company.errorSave'));
        return;
      }
      announce(t('mover.company.saved'));
      goBack();
    },
    (invalid: FieldErrors<MoverCompanyFormInput>) => {
      const texts = FIELDS.flatMap((name) => {
        const text = errorText(invalid[name]?.message);
        return text ? [`${label(name)}: ${text}`] : [];
      });
      say([t('mover.company.checkFields'), ...texts].join(' '));
    },
  );

  const countryOptions = MOVER_COUNTRIES.map((code) => ({ value: code, label: countryName(code) }));

  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      <BackLink />
      <View className="gap-2">
        <Display tone="dark">{t('mover.company.title')}</Display>
        <Text className="font-sans text-[15px] leading-[22px] text-sage-400">{t('mover.company.subtitle')}</Text>
      </View>

      {row?.verification_status === 'rejected' && row.review_note ? (
        <DarkPanel>
          <Text testID="company-review-note" className="font-sans text-sm leading-5 text-accent-300">
            {t('mover.reviewNote', { note: row.review_note })}
          </Text>
        </DarkPanel>
      ) : null}
      {row?.verification_status === 'verified' ? (
        <DarkPanel>
          <Text testID="company-reverify" className="font-sans text-sm leading-5 text-night-50">
            {t('mover.company.reverifyNotice')}
          </Text>
        </DarkPanel>
      ) : null}

      <Controller
        control={form.control}
        name="isBusiness"
        render={({ field }) => (
          <View className="gap-2">
            <ChipGroup
              variant="dark-pill"
              label={label('isBusiness')}
              accessibilityLabel={label('isBusiness')}
              value={field.value ? 'business' : 'individual'}
              onChange={(kind) => field.onChange(kind === 'business')}
              options={[
                { value: 'business', label: t('mover.company.kindBusiness') },
                { value: 'individual', label: t('mover.company.kindIndividual') },
              ]}
            />
            <Text className="font-sans text-[13px] leading-[18px] text-sage-400">
              {field.value ? t('mover.company.kindBusinessHint') : t('mover.company.kindIndividualHint')}
            </Text>
          </View>
        )}
      />

      <Controller
        control={form.control}
        name="country"
        render={({ field }) => (
          <CountryChoice
            label={label('country')}
            value={field.value}
            options={countryOptions}
            error={shownError('country')}
            onChange={(code) => {
              // Taxed where registered, unless the mover chose otherwise.
              const previous = form.getValues('country');
              const residence = form.getValues('taxResidencyCountry');
              field.onChange(code);
              if (residence === undefined || residence === previous) {
                form.setValue('taxResidencyCountry', code, { shouldValidate: form.formState.isSubmitted });
              }
            }}
          />
        )}
      />

      <Controller
        control={form.control}
        name="legalName"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            testID="company-legal-name"
            tone="dark"
            announceError={false}
            label={label('legalName')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={shownError('legalName')}
            autoCapitalize="words"
            autoComplete={isBusiness ? 'organization' : 'name'}
            textContentType={isBusiness ? 'organizationName' : 'name'}
          />
        )}
      />

      {isBusiness && registration?.rule === 'sameAsTax' ? (
        <Text testID="company-registration-same" className="font-sans text-[13px] leading-[18px] text-sage-400">
          {t('mover.company.registrationSameAsTax', { country: country ? countryName(country) : '' })}
        </Text>
      ) : isBusiness ? (
        <Controller
          control={form.control}
          name="registrationNo"
          render={({ field }) => (
            <TextField
              ref={field.ref}
              testID="company-registration"
              tone="dark"
              announceError={false}
              label={label('registrationNo')}
              hint={registrationKinds ? t('mover.company.idHint', idHint(registrationKinds)) : t('mover.company.registrationNoHint')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={shownError('registrationNo')}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          )}
        />
      ) : null}

      <Controller
        control={form.control}
        name="taxId"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            testID="company-tax-id"
            tone="dark"
            announceError={false}
            label={label('taxId')}
            hint={taxHint ? t('mover.company.idHint', taxHint) : t('mover.company.taxIdHint')}
            value={field.value}
            onChangeText={(value) => {
              setRegisteredName('');
              field.onChange(value);
            }}
            onBlur={field.onBlur}
            error={shownError('taxId')}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        )}
      />

      <Controller
        control={form.control}
        name="taxResidencyCountry"
        render={({ field }) => (
          <CountryChoice
            label={label('taxResidencyCountry')}
            value={field.value}
            options={countryOptions}
            error={shownError('taxResidencyCountry')}
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={form.control}
        name="address"
        render={({ field }) => (
          <CompanyAddressPicker
            label={label('address')}
            value={field.value ?? null}
            onChange={field.onChange}
            country={country}
            error={shownError('address')}
          />
        )}
      />

      <Controller
        control={form.control}
        name="contactPhone"
        render={({ field }) => (
          <View className="gap-2.5">
            <TextField
              ref={field.ref}
              testID="company-phone"
              tone="dark"
              announceError={false}
              label={label('contactPhone')}
              hint={t('mover.company.phoneHint')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={shownError('contactPhone')}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
            />
            <PhoneCode phone={field.value} />
          </View>
        )}
      />

      <Controller
        control={form.control}
        name="contactEmail"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            testID="company-email"
            tone="dark"
            announceError={false}
            label={label('contactEmail')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={shownError('contactEmail')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
        )}
      />

      <DarkPanel className="gap-3">
        <Text className="font-sans text-sm leading-5 text-night-50">{t('mover.company.shownToCustomers')}</Text>
        <Text className="font-sans text-sm leading-5 text-sage-400">{t('mover.company.taxNotice')}</Text>
      </DarkPanel>

      <Controller
        control={form.control}
        name="selfCertified"
        render={({ field }) => (
          <Checkbox
            testID="company-self-certification"
            tone="dark"
            announceError={false}
            checked={field.value}
            onChange={field.onChange}
            label={label('selfCertified')}
            error={shownError('selfCertified')}
          />
        )}
      />

      {errors.root ? (
        <Text testID="company-error" className="font-sans text-sm text-danger-on-dark">
          {t('mover.company.errorSave')}
        </Text>
      ) : null}
      <Button testID="company-save" variant="accent" title={t('mover.company.save')} loading={form.formState.isSubmitting} onPress={submit} />
    </Screen>
  );
}

/** One country out of the markets, as pills; its error under it. */
function CountryChoice({
  label,
  value,
  options,
  error,
  onChange,
}: {
  label: string;
  value: MoverCountry | undefined;
  options: { value: MoverCountry; label: string }[];
  error: string | undefined;
  onChange: (code: MoverCountry) => void;
}) {
  return (
    <View className="gap-1.5">
      {/* No country chosen yet: no chip is selected (the group's value matches none of them). */}
      <ChipGroup<MoverCountry | ''>
        variant="dark-pill"
        label={label}
        accessibilityLabel={error ? `${label}, ${error}` : label}
        value={value ?? ''}
        onChange={(code) => {
          if (code !== '') onChange(code);
        }}
        options={options}
      />
      {error ? <Text className="font-sans text-[13px] text-danger-on-dark">{error}</Text> : null}
    </View>
  );
}
