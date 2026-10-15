import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { quoteVehicle } from '@movershub/pricing';
import {
  BOOKING_FEE_RULE,
  MOVER_COUNTRIES,
  SERVICE_AREA_RADII_KM,
  TYPICAL_LOADS,
  formatMoney,
  perMinuteFromHourly,
  rateCardCurrencies,
  rateCardFormDefaults,
  rateCardFormSchema,
  toMinorUnits,
  type Currency,
  type GeoSuggestion,
  type MoverCountry,
  type RateCard,
  type RateCardFormInput,
  type RateCardRow,
  type VehicleRow,
} from '@movershub/shared';
import { Button, ChipGroup, DarkPanel, Display, Pill, Screen, TextField, announce, currentLocale, useAnnouncement } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { useMoverCompany } from '@/lib/mover-company';
import { useRateCards, useSaveRateCard, useServiceAreas } from '@/lib/rates';
import { useVehicles } from '@/lib/vehicles';

import { PlaceSearch } from './place-search';

const RATE_ERRORS = ['amount_required', 'amount_invalid', 'whole_units', 'km_invalid', 'long_distance_both'] as const;
type RateError = (typeof RATE_ERRORS)[number];
const isRateError = (m: string): m is RateError => (RATE_ERRORS as readonly string[]).includes(m);

function goBack(fallback: '/' | '/mover/rates') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

function BackLink({ fallback }: { fallback: '/' | '/mover/rates' }) {
  const { t } = useTranslation();
  return <Button testID="rates-back" variant="link-dark" className="self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={() => goBack(fallback)} />;
}

/** Company, vans, prices and work areas, and whether they are all loaded. */
function useRatesData() {
  const company = useMoverCompany();
  const companyId = company.data?.id;
  const vehicles = useVehicles(companyId);
  const cards = useRateCards(companyId);
  const areas = useServiceAreas(companyId);
  const queries = [vehicles, cards, areas.query];
  const failed = company.isError || queries.some((q) => q.isError);
  const loading = company.isPending || (Boolean(company.data) && queries.some((q) => q.isPending));
  const retry = () => {
    void company.refetch();
    for (const q of queries) void q.refetch();
  };
  return { company, vehicles, cards, areas, failed, loading, retry };
}

function Waiting({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return failed ? (
    <View className="gap-3">
      <Text className="font-sans text-base text-night-50">{t('common.errorGeneric')}</Text>
      <Button testID="rates-retry" variant="accent" title={t('common.retry')} onPress={onRetry} />
    </View>
  ) : (
    <ActivityIndicator color={colors.accent[300]} accessibilityLabel={t('common.loading')} />
  );
}

/**
 * "Your prices and work area" (mover side, setup step 4 — COMPLIANCE §1, §1.1; design/DECISIONS.md #22):
 * every van in use with its own prices, and the towns the mover picks up jobs around.
 */
export function RatesScreen() {
  const { t } = useTranslation();
  const { company, vehicles, cards, areas, failed, loading, retry } = useRatesData();
  const inUse = vehicles.data?.filter((v) => v.active) ?? [];

  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      <BackLink fallback="/" />
      <View className="gap-2">
        <Display tone="dark">{t('mover.rates.title')}</Display>
        <Text className="font-sans text-[15px] leading-[22px] text-sage-400">{t('mover.rates.subtitle')}</Text>
      </View>
      {failed || loading ? (
        <Waiting failed={failed} onRetry={retry} />
      ) : !company.data ? (
        <DarkPanel className="gap-3">
          <Text className="font-sans text-sm leading-5 text-night-50">{t('mover.vehicles.needCompany')}</Text>
          <Button testID="rates-company" variant="accent" size="md" title={t('mover.documents.goToCompany')} onPress={() => router.replace('/mover/company')} />
        </DarkPanel>
      ) : (
        <>
          <View className="gap-3">
            <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
              {t('mover.rates.pricesTitle')}
            </Text>
            {inUse.length === 0 ? (
              <DarkPanel className="gap-3">
                <Text className="font-sans text-sm leading-5 text-night-50">{t('mover.rates.needVan')}</Text>
                <Button testID="rates-vans" variant="accent" size="md" title={t('mover.vehicles.add')} onPress={() => router.push('/mover/vehicles')} />
              </DarkPanel>
            ) : (
              inUse.map((v) => <VanPrices key={v.id} vehicle={v} card={cards.data?.find((c) => c.vehicle_id === v.id)} />)
            )}
          </View>
          <WorkAreas country={company.data.country} areas={areas} />
        </>
      )}
    </Screen>
  );
}

function VanPrices({ vehicle, card }: { vehicle: VehicleRow; card: RateCardRow | undefined }) {
  const { t } = useTranslation();
  const saved = card?.confirmed_by_mover_at !== null && card !== undefined;
  return (
    <View testID={`rates-${vehicle.plate}`} className="gap-3 rounded-panel border border-night-600 bg-night-800 p-3.5">
      <View accessible className="flex-row items-start gap-3">
        <Text className="flex-1 font-sans-semibold text-[15px] text-night-50">
          {t(`vehicles.${vehicle.class}.name`)} · {vehicle.plate}
        </Text>
        <Pill tone={saved ? 'dark' : 'accent'} size="sm">
          {saved ? t('mover.rates.pricesSaved') : t('mover.rates.noPrices')}
        </Pill>
      </View>
      <Button
        testID={`rates-${vehicle.plate}-edit`}
        variant="outline-dark"
        size="sm"
        className="self-start"
        title={saved ? t('mover.rates.changePrices') : t('mover.rates.setPrices')}
        onPress={() => router.push({ pathname: '/mover/rate-card', params: { vehicle: vehicle.id } })}
      />
    </View>
  );
}

function WorkAreas({ country, areas }: { country: string; areas: ReturnType<typeof useServiceAreas> }) {
  const { t } = useTranslation();
  const [place, setPlace] = useState<GeoSuggestion | null>(null);
  const [radius, setRadius] = useState<number>(50);
  const moverCountry = (MOVER_COUNTRIES as readonly string[]).includes(country) ? (country as MoverCountry) : undefined;

  const add = async () => {
    if (!place) return;
    try {
      await areas.add.mutateAsync({ place, radiusKm: radius });
    } catch {
      return;
    }
    announce(t('mover.rates.areaAdded', { place: place.area, km: radius }));
    setPlace(null);
  };

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
          {t('mover.rates.areasTitle')}
        </Text>
        <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{t('mover.rates.areasText')}</Text>
      </View>
      {areas.query.data?.map((a) => (
        <View key={a.id} testID={`area-${a.label ?? a.id}`} className="flex-row items-center gap-3 rounded-panel border border-night-600 bg-night-800 px-3.5 py-2">
          <Text className="flex-1 font-sans-medium text-[15px] text-night-50">{t('mover.rates.area', { place: a.label ?? '', km: a.radius_km })}</Text>
          <Button
            testID={`area-${a.label ?? a.id}-remove`}
            variant="link-dark"
            title={t('mover.rates.removeArea')}
            loading={areas.remove.isPending && areas.remove.variables === a.id}
            onPress={() => areas.remove.mutate(a.id)}
          />
        </View>
      ))}
      <View className="gap-3 rounded-panel border border-night-600 bg-night-800 p-3.5">
        {place ? (
          <>
            <Text testID="area-place" className="font-sans-medium text-[15px] text-night-50">
              {place.label}
            </Text>
            <ChipGroup
              variant="dark-pill"
              label={t('mover.rates.radius')}
              accessibilityLabel={t('mover.rates.radius')}
              value={radius}
              onChange={setRadius}
              options={SERVICE_AREA_RADII_KM.map((km) => ({ value: km, label: t('mover.rates.km', { km }) }))}
            />
            <Button testID="area-add" variant="accent" size="md" title={t('mover.rates.addArea')} loading={areas.add.isPending} onPress={() => void add()} />
            <Button variant="link-dark" className="self-start" title={t('mover.documents.cancel')} onPress={() => setPlace(null)} />
          </>
        ) : (
          <PlaceSearch
            testIDPrefix="area"
            label={t('mover.rates.areaSearch')}
            placeholder={t('mover.rates.areaPlaceholder')}
            country={moverCountry}
            onChoose={setPlace}
          />
        )}
        {areas.add.isError || areas.remove.isError ? (
          <Text testID="area-error" className="font-sans text-[13px] text-danger-on-dark">
            {t('mover.rates.errorSave')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** One van's prices (`?vehicle=`): its rate card, with a live example from the same price engine as quotes. */
export function RateCardScreen({ vehicleId }: { vehicleId: string | undefined }) {
  const { company, vehicles, cards, failed, loading, retry } = useRatesData();
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  if (failed || loading || !company.data || !vehicle) {
    return (
      <Screen tone="dark">
        <StatusBar style="light" />
        <BackLink fallback="/mover/rates" />
        <Waiting failed={failed || (!loading && !vehicle)} onRetry={retry} />
      </Screen>
    );
  }
  return <RateCardForm companyId={company.data.id} country={company.data.country} vehicle={vehicle} card={cards.data?.find((c) => c.vehicle_id === vehicle.id) ?? null} />;
}

function RateCardForm({ companyId, country, vehicle, card }: { companyId: string; country: string; vehicle: VehicleRow; card: RateCardRow | null }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const save = useSaveRateCard(companyId);
  const [{ values, suggested }] = useState(() => rateCardFormDefaults(card, country, vehicle.class));
  const currencies = [...new Set<Currency>([...rateCardCurrencies(country), values.currency])];
  const [summary, setSummary] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useAnnouncement(summary, attempt);

  const form = useForm<RateCardFormInput, unknown, RateCard>({ resolver: zodResolver(rateCardFormSchema), defaultValues: values });
  const watched = useWatch({ control: form.control }) as RateCardFormInput;
  const currency = watched.currency;
  const errors = form.formState.errors;
  const errorText = (message: string | undefined) =>
    message === undefined ? undefined : isRateError(message) ? t(`mover.rates.errors.${message}`) : t('common.errorGeneric');
  const money = (amount: number) => formatMoney(amount, currency, locale, { wholeUnits: false });

  // What an hourly rate is kept as: per minute, and that per minute × 60.
  const hourlyHint = (raw: string | undefined) => {
    if (!raw || !/^\d{1,7}([.,]\d{1,2})?$/.test(raw.trim())) return t('mover.rates.hourlyHint');
    const perMinute = perMinuteFromHourly(toMinorUnits(raw));
    return t('mover.rates.keptAs', { perMinute: money(perMinute), hourly: money(perMinute * 60) });
  };

  // A live example from the same engine as customers' quotes (nothing is sent: the server prices jobs).
  const parsed = rateCardFormSchema.safeParse(watched);
  const crew: 1 | 2 = parsed.success && parsed.data.perLaborMinute[2] !== null ? 2 : 1;
  const example = parsed.success
    ? quoteVehicle(
        {
          vehicleClass: vehicle.class,
          distanceKm: 15,
          crossBorder: false,
          helpers: crew,
          stops: [
            { floor: 2, hasLift: false },
            { floor: 0, hasLift: false },
          ],
          items: TYPICAL_LOADS[vehicle.class].map((it) => ({ ...it })),
        },
        parsed.data,
        { bookingFee: BOOKING_FEE_RULE },
      )
    : null;

  const submit = form.handleSubmit(
    async (rates) => {
      try {
        await save.mutateAsync({ vehicleId: vehicle.id, card: rates, exists: card !== null });
      } catch {
        form.setError('root', { message: 'save' });
        setSummary(t('mover.rates.errorSave'));
        setAttempt((n) => n + 1);
        return;
      }
      announce(t('mover.rates.saved'));
      goBack('/mover/rates');
    },
    (invalid: FieldErrors<RateCardFormInput>) => {
      const texts = Object.values(invalid).flatMap((e) => {
        const text = errorText(e?.message);
        return text ? [text] : [];
      });
      setSummary([t('mover.company.checkFields'), ...new Set(texts)].join(' '));
      setAttempt((n) => n + 1);
    },
  );

  const amountField = (name: Exclude<keyof RateCardFormInput, 'currency'>, label: string, hint?: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <TextField
          ref={field.ref}
          testID={`rate-${name}`}
          tone="dark"
          announceError={false}
          label={label}
          hint={hint}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={errorText(errors[name]?.message)}
          keyboardType="decimal-pad"
          maxLength={10}
        />
      )}
    />
  );

  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      <BackLink fallback="/mover/rates" />
      <View className="gap-2">
        <Display tone="dark">{t('mover.rates.cardTitle')}</Display>
        <Text className="font-sans text-[15px] text-sage-400">
          {t(`vehicles.${vehicle.class}.name`)} · {vehicle.plate}
        </Text>
      </View>
      {suggested ? (
        <DarkPanel>
          <Text testID="rate-suggested" className="font-sans text-sm leading-5 text-night-50">
            {t('mover.rates.suggested')}
          </Text>
        </DarkPanel>
      ) : null}

      <Controller
        control={form.control}
        name="currency"
        render={({ field }) => (
          <View className="gap-1.5">
            <ChipGroup
              variant="dark-pill"
              label={t('mover.rates.currency')}
              accessibilityLabel={t('mover.rates.currency')}
              value={field.value}
              onChange={field.onChange}
              options={currencies.map((c) => ({ value: c, label: c }))}
            />
            <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{t('mover.rates.currencyHint')}</Text>
          </View>
        )}
      />

      {amountField('baseFee', t('mover.rates.baseFee', { currency }), t('mover.rates.baseFeeHint'))}
      {amountField('perKm', t('mover.rates.perKm', { currency }))}
      {amountField('hourly1', t('mover.rates.hourly1', { currency }), hourlyHint(watched.hourly1))}
      {amountField('hourly2', t('mover.rates.hourly2', { currency }), watched.hourly2 ? hourlyHint(watched.hourly2) : t('mover.rates.crewOptional'))}
      {amountField('hourly3', t('mover.rates.hourly3', { currency }), watched.hourly3 ? hourlyHint(watched.hourly3) : t('mover.rates.crewOptional'))}
      {amountField('minPrice', t('mover.rates.minPrice', { currency }), t('mover.rates.minPriceHint'))}

      <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
        {t('mover.rates.extrasTitle')}
      </Text>
      {amountField('floorWithoutLiftFee', t('mover.rates.floorFee', { currency }))}
      {amountField('heavyItemFee', t('mover.rates.heavyItemFee', { currency }), t('mover.rates.heavyItemHint'))}
      {amountField('assemblyPerItem', t('mover.rates.assemblyFee', { currency }))}

      <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
        {t('mover.rates.longDistanceTitle')}
      </Text>
      <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{t('mover.rates.longDistanceText')}</Text>
      {amountField('longDistanceFromKm', t('mover.rates.longDistanceFrom'))}
      {amountField('longDistancePerKm', t('mover.rates.longDistancePerKm', { currency }))}

      {example?.ok ? (
        <DarkPanel className="gap-1.5">
          <Text className="font-sans-semibold text-[15px] text-night-50">{t('mover.rates.exampleTitle')}</Text>
          <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{t('mover.rates.exampleJob', { crew })}</Text>
          <Text testID="rate-example" className="font-sans text-sm leading-5 text-night-50">
            {t('mover.rates.exampleResult', {
              price: formatMoney(example.quote.moverPrice, example.quote.currency, locale),
              payout: formatMoney(example.quote.moverPayout, example.quote.currency, locale),
              pct: example.quote.takeRatePct,
            })}
          </Text>
        </DarkPanel>
      ) : null}

      <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{t('mover.rates.saveNote')}</Text>
      {errors.root ? (
        <Text testID="rate-error" className="font-sans text-sm text-danger-on-dark">
          {t('mover.rates.errorSave')}
        </Text>
      ) : null}
      <Button testID="rate-save" variant="accent" title={t('mover.rates.save')} loading={form.formState.isSubmitting} onPress={submit} />
    </Screen>
  );
}
