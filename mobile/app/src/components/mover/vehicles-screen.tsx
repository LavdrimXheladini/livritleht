import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import {
  LIGHT_VEHICLE_MAX_KG,
  VEHICLE_CLASSES,
  VEHICLE_CLASS_INFO,
  tonnes,
  vehicleFormDefaults,
  vehicleFormSchema,
  vehicleStatus,
  type VehicleClass,
  type VehicleForm,
  type VehicleFormInput,
  type VehicleRow,
} from '@movershub/shared';
import { Button, Checkbox, ChipGroup, DarkPanel, Display, Pill, Screen, TextField, announce, useAnnouncement, type PillTone } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { useMoverCompany } from '@/lib/mover-company';
import { useSaveVehicle, useVehicles } from '@/lib/vehicles';

const VEHICLE_ERRORS = [
  'class_required',
  'plate_required',
  'plate_invalid',
  'plate_taken',
  'weight_required',
  'weight_invalid',
  'weight_too_heavy_for_class',
  'weight_too_light_for_truck',
  'volume_required',
  'volume_invalid',
] as const;
type VehicleError = (typeof VEHICLE_ERRORS)[number];
const isVehicleError = (m: string): m is VehicleError => (VEHICLE_ERRORS as readonly string[]).includes(m);

const STATUS_TONE: Record<ReturnType<typeof vehicleStatus>, PillTone> = { verified: 'dark', checking: 'dark-muted', changes: 'accent', inactive: 'dark-muted' };

function goBack(fallback: '/' | '/mover/vehicles') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

function BackLink({ fallback }: { fallback: '/' | '/mover/vehicles' }) {
  const { t } = useTranslation();
  return <Button testID="vehicles-back" variant="link-dark" className="self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={() => goBack(fallback)} />;
}

/** The company and its vans, or what to show while they load (null = ready). */
function useCompanyVehicles() {
  const company = useMoverCompany();
  const vehicles = useVehicles(company.data?.id ?? undefined);
  const failed = company.isError || vehicles.isError;
  const loading = company.isPending || (Boolean(company.data) && vehicles.isPending);
  return { company, vehicles, failed, loading };
}

function NeedsCompany() {
  const { t } = useTranslation();
  return (
    <DarkPanel className="gap-3">
      <Text className="font-sans text-sm leading-5 text-night-50">{t('mover.vehicles.needCompany')}</Text>
      <Button testID="vehicles-company" variant="accent" size="md" title={t('mover.documents.goToCompany')} onPress={() => router.replace('/mover/company')} />
    </DarkPanel>
  );
}

function LoadState({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return failed ? (
    <View className="gap-3">
      <Text className="font-sans text-base text-night-50">{t('common.errorGeneric')}</Text>
      <Button testID="vehicles-retry" variant="accent" title={t('common.retry')} onPress={onRetry} />
    </View>
  ) : (
    <ActivityIndicator color={colors.accent[300]} accessibilityLabel={t('common.loading')} />
  );
}

/**
 * "Your vans" (mover side, setup step 3 — COMPLIANCE §5: plate, type, capacity; design/DECISIONS.md
 * #21): every van with its class, plate, weight and volume and where its check stands. Vans are never
 * deleted (prices and jobs refer to them): they are taken out of use.
 */
export function VehiclesScreen() {
  const { t } = useTranslation();
  const { company, vehicles, failed, loading } = useCompanyVehicles();
  const { setActive } = useSaveVehicle(company.data?.id ?? undefined);

  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      <BackLink fallback="/" />
      <View className="gap-2">
        <Display tone="dark">{t('mover.vehicles.title')}</Display>
        <Text className="font-sans text-[15px] leading-[22px] text-sage-400">{t('mover.vehicles.subtitle')}</Text>
      </View>
      {failed || loading ? (
        <LoadState
          failed={failed}
          onRetry={() => {
            void company.refetch();
            void vehicles.refetch();
          }}
        />
      ) : !company.data ? (
        <NeedsCompany />
      ) : (
        <View className="gap-3">
          {vehicles.data?.length ? null : <Text className="font-sans text-sm text-sage-400">{t('mover.vehicles.none')}</Text>}
          {vehicles.data?.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              busy={setActive.isPending && setActive.variables?.vehicleId === v.id}
              onToggle={() => setActive.mutate({ vehicleId: v.id, active: !v.active })}
            />
          ))}
          {setActive.isError ? (
            <Text testID="vehicles-error" className="font-sans text-[13px] text-danger-on-dark">
              {t('mover.vehicles.errorSave')}
            </Text>
          ) : null}
          <Button testID="vehicles-add" variant="accent" title={t('mover.vehicles.add')} onPress={() => router.push('/mover/vehicle')} />
        </View>
      )}
    </Screen>
  );
}

function VehicleCard({ vehicle, busy, onToggle }: { vehicle: VehicleRow; busy: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const status = vehicleStatus(vehicle);
  const details = [
    vehicle.max_weight_kg === null ? null : tonnes(vehicle.max_weight_kg),
    vehicle.volume_m3 === null ? null : `${vehicle.volume_m3} m³`,
    vehicle.has_tail_lift ? t('mover.vehicles.tailLift') : null,
    vehicle.tachograph ? t('mover.vehicles.tachographShort') : null,
  ].filter(Boolean);
  return (
    <View testID={`vehicle-${vehicle.plate}`} className="gap-3 rounded-panel border border-night-600 bg-night-800 p-3.5">
      <View accessible className="flex-row items-start gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-sans-semibold text-[15px] text-night-50">
            {t(`vehicles.${vehicle.class}.name`)} · {vehicle.plate}
          </Text>
          <Text className="font-sans text-[13px] text-sage-400">{details.join(' · ')}</Text>
          {status === 'changes' && vehicle.review_note ? (
            <Text testID={`vehicle-${vehicle.plate}-note`} className="font-sans text-[13px] leading-[18px] text-accent-300">
              {t('mover.reviewNote', { note: vehicle.review_note })}
            </Text>
          ) : null}
        </View>
        <Pill tone={STATUS_TONE[status]} size="sm">
          {t(`mover.vehicles.status.${status}`)}
        </Pill>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          testID={`vehicle-${vehicle.plate}-edit`}
          variant="outline-dark"
          size="sm"
          title={t('mover.vehicles.edit')}
          onPress={() => router.push({ pathname: '/mover/vehicle', params: { id: vehicle.id } })}
        />
        <Button
          testID={`vehicle-${vehicle.plate}-toggle`}
          variant="link-dark"
          title={vehicle.active ? t('mover.vehicles.takeOutOfUse') : t('mover.vehicles.useAgain')}
          loading={busy}
          onPress={onToggle}
        />
      </View>
    </View>
  );
}

/** Add a van (no `vehicleId`) or change one. */
export function VehicleFormScreen({ vehicleId }: { vehicleId: string | undefined }) {
  const { company, vehicles, failed, loading } = useCompanyVehicles();
  const row = vehicleId ? vehicles.data?.find((v) => v.id === vehicleId) : undefined;
  if (failed || loading || !company.data || (vehicleId && !row)) {
    return (
      <Screen tone="dark">
        <StatusBar style="light" />
        <BackLink fallback="/mover/vehicles" />
        {failed || loading ? (
          <LoadState
            failed={failed}
            onRetry={() => {
              void company.refetch();
              void vehicles.refetch();
            }}
          />
        ) : !company.data ? (
          <NeedsCompany />
        ) : null}
      </Screen>
    );
  }
  return <VehicleFormBody companyId={company.data.id} row={row ?? null} />;
}

function VehicleFormBody({ companyId, row }: { companyId: string; row: VehicleRow | null }) {
  const { t } = useTranslation();
  const { save } = useSaveVehicle(companyId);
  const [summary, setSummary] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useAnnouncement(summary, attempt);
  const form = useForm<VehicleFormInput, unknown, VehicleForm>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: vehicleFormDefaults(row),
  });
  const vehicleClass = useWatch({ control: form.control, name: 'vehicleClass' });
  const weight = Number(useWatch({ control: form.control, name: 'maxWeightKg' }));
  const errors = form.formState.errors;
  const errorText = (message: string | undefined) =>
    message === undefined ? undefined : isVehicleError(message) ? t(`mover.vehicles.errors.${message}`) : t('common.errorGeneric');
  const shownError = (name: keyof VehicleFormInput) => errorText(errors[name]?.message);
  const say = (text: string) => {
    setSummary(text);
    setAttempt((n) => n + 1);
  };

  const submit = form.handleSubmit(
    async (values) => {
      try {
        await save.mutateAsync({ form: values, vehicleId: row?.id ?? null });
      } catch (e) {
        const { code, message = '' } = (e as { code?: string; message?: string } | null) ?? {};
        const key: VehicleError | null =
          code === '23505' ? 'plate_taken' : code === '23514' ? 'weight_too_heavy_for_class' : message.includes('vehicle_plate_invalid') ? 'plate_invalid' : null;
        if (key) {
          form.setError(key === 'plate_taken' || key === 'plate_invalid' ? 'plate' : 'maxWeightKg', { message: key }, { shouldFocus: true });
          say(errorText(key) ?? '');
          return;
        }
        form.setError('root', { message: 'save' });
        say(t('mover.vehicles.errorSave'));
        return;
      }
      announce(t('mover.vehicles.saved'));
      goBack('/mover/vehicles');
    },
    (invalid: FieldErrors<VehicleFormInput>) => {
      const texts = (['vehicleClass', 'plate', 'maxWeightKg', 'volumeM3'] as const).flatMap((name) => {
        const text = errorText(invalid[name]?.message);
        return text ? [text] : [];
      });
      say([t('mover.company.checkFields'), ...texts].join(' '));
    },
  );

  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      <BackLink fallback="/mover/vehicles" />
      <Display tone="dark">{row ? t('mover.vehicles.editTitle') : t('mover.vehicles.addTitle')}</Display>

      {row?.verified_at ? (
        <DarkPanel>
          <Text testID="vehicle-reverify" className="font-sans text-sm leading-5 text-night-50">
            {t('mover.vehicles.reverifyNotice')}
          </Text>
        </DarkPanel>
      ) : null}

      <Controller
        control={form.control}
        name="vehicleClass"
        render={({ field }) => (
          <View className="gap-1.5">
            <ChipGroup<VehicleClass | ''>
              variant="dark-pill"
              label={t('mover.vehicles.class')}
              accessibilityLabel={[t('mover.vehicles.class'), shownError('vehicleClass')].filter(Boolean).join(', ')}
              value={field.value ?? ''}
              onChange={(c) => {
                if (c !== '') field.onChange(c);
              }}
              options={VEHICLE_CLASSES.map((c) => ({ value: c, label: t(`vehicles.${c}.name`) }))}
            />
            {vehicleClass ? (
              <Text className="font-sans text-[13px] leading-[18px] text-sage-400">
                {VEHICLE_CLASS_INFO[vehicleClass].capacity} · {VEHICLE_CLASS_INFO[vehicleClass].examples} · {t(`vehicles.${vehicleClass}.fits`)}
              </Text>
            ) : null}
            {shownError('vehicleClass') ? <Text className="font-sans text-[13px] text-danger-on-dark">{shownError('vehicleClass')}</Text> : null}
          </View>
        )}
      />

      <Controller
        control={form.control}
        name="plate"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            testID="vehicle-plate"
            tone="dark"
            announceError={false}
            label={t('mover.vehicles.plate')}
            hint={t('mover.vehicles.plateHint')}
            value={field.value}
            // In capitals as typed, like on the vehicle (the browser version ignores autoCapitalize).
            onChangeText={(plate) => field.onChange(plate.toUpperCase())}
            onBlur={field.onBlur}
            error={shownError('plate')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={16}
          />
        )}
      />

      <Controller
        control={form.control}
        name="maxWeightKg"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            testID="vehicle-weight"
            tone="dark"
            announceError={false}
            label={t('mover.vehicles.weight')}
            hint={t('mover.vehicles.weightHint')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={shownError('maxWeightKg')}
            keyboardType="number-pad"
            maxLength={5}
          />
        )}
      />

      <Controller
        control={form.control}
        name="volumeM3"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            testID="vehicle-volume"
            tone="dark"
            announceError={false}
            label={t('mover.vehicles.volume')}
            hint={t('mover.vehicles.volumeHint')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={shownError('volumeM3')}
            keyboardType="decimal-pad"
            maxLength={5}
          />
        )}
      />

      <Controller
        control={form.control}
        name="hasTailLift"
        render={({ field }) => (
          <Checkbox testID="vehicle-tail-lift" tone="dark" checked={field.value} onChange={field.onChange} label={t('mover.vehicles.tailLiftQuestion')} />
        )}
      />

      {weight > LIGHT_VEHICLE_MAX_KG ? (
        <Controller
          control={form.control}
          name="tachograph"
          render={({ field }) => (
            <View className="gap-1">
              <Checkbox testID="vehicle-tachograph" tone="dark" checked={field.value} onChange={field.onChange} label={t('mover.vehicles.tachographQuestion')} />
              <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{t('mover.vehicles.tachographHint')}</Text>
            </View>
          )}
        />
      ) : null}

      {errors.root ? (
        <Text testID="vehicle-error" className="font-sans text-sm text-danger-on-dark">
          {t('mover.vehicles.errorSave')}
        </Text>
      ) : null}
      <Button testID="vehicle-save" variant="accent" title={t('mover.vehicles.save')} loading={form.formState.isSubmitting} onPress={submit} />
    </Screen>
  );
}
