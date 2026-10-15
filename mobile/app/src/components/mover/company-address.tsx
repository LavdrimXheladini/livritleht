import * as Linking from 'expo-linking';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { MOVER_COUNTRIES, formatCompanyAddress, type CompanyAddress, type MoverCountry } from '@movershub/shared';
import { Button, CheckIcon, PinIcon, TextField, cx } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { PlaceSearch } from './place-search';

/** OpenStreetMap at the point, in the browser or the phone's map app. */
const mapUrl = (a: Pick<CompanyAddress, 'lat' | 'lon'>) => `https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lon}#map=18/${a.lat}/${a.lon}`;

function useCountryName() {
  const { t } = useTranslation();
  return (code: string) => ((MOVER_COUNTRIES as readonly string[]).includes(code) ? t(`common.countries.${code as MoverCountry}`) : code);
}

/**
 * The company address (design/DECISIONS.md #19): found in the map search (OpenStreetMap, through the
 * `places` function), then confirmed by the mover — "Yes, this is the address" — after checking it,
 * on the map too. Map data often has no house number in Kosovo and Albania: the mover adds it, and
 * the street when the map has none. Postgres takes the address only with its point on the map.
 */
export function CompanyAddressPicker({
  label,
  value,
  onChange,
  country,
  error,
}: {
  label: string;
  value: CompanyAddress | null;
  onChange: (address: CompanyAddress | null) => void;
  country: MoverCountry | undefined;
  error: string | undefined;
}) {
  if (value === null) return <AddressSearch label={label} country={country} error={error} onChoose={onChange} />;
  return <AddressCard label={label} value={value} onChange={onChange} error={error} />;
}

function AddressSearch({
  label,
  country,
  error,
  onChoose,
}: {
  label: string;
  country: MoverCountry | undefined;
  error: string | undefined;
  onChoose: (address: CompanyAddress) => void;
}) {
  const { t } = useTranslation();
  return (
    <PlaceSearch
      testIDPrefix="company-address"
      label={label}
      placeholder={t('mover.company.addressPlaceholder')}
      hint={t('mover.company.addressSearchHint')}
      country={country}
      error={error}
      onChoose={(s) =>
        onChoose({
          ...(s.street ? { street: s.street } : {}),
          ...(s.houseNumber ? { houseNumber: s.houseNumber } : {}),
          ...(s.postcode ? { postcode: s.postcode } : {}),
          city: s.city ?? s.area,
          countryCode: s.countryCode,
          lat: s.lat,
          lon: s.lon,
          confirmed: false,
        })
      }
    />
  );
}

/** The chosen address: to confirm (house number, street if missing, map), or confirmed. */
function AddressCard({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: CompanyAddress;
  onChange: (address: CompanyAddress | null) => void;
  error: string | undefined;
}) {
  const { t } = useTranslation();
  const countryName = useCountryName();
  // The street field stays while the mover types it, even once it has a value.
  const [streetFromMap] = useState(value.street !== undefined && value.street !== '');
  const text = `${formatCompanyAddress(value)}, ${countryName(value.countryCode)}`;
  const edit = (patch: Partial<CompanyAddress>) => {
    const next = { ...value, ...patch, confirmed: false };
    for (const key of ['street', 'houseNumber'] as const) if (next[key] === '') delete next[key];
    onChange(next);
  };

  return (
    <View className="gap-1.5">
      <Text aria-hidden className="font-sans text-[13px] text-sage-400">
        {label}
      </Text>
      <View className={cx('gap-3 rounded-panel border bg-night-800 p-3.5', error ? 'border-danger-on-dark' : 'border-night-600')}>
        <View accessible className="flex-row items-start gap-2.5">
          <PinIcon size={18} color={colors.accent[300]} />
          <Text testID="company-address-text" className="flex-1 font-sans-medium text-[15px] leading-[21px] text-night-50">
            {text}
          </Text>
        </View>

        {value.confirmed ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <View testID="company-address-confirmed" accessible className="flex-row items-center gap-2">
              <CheckIcon size={16} color={colors.accent[300]} />
              <Text className="font-sans-medium text-sm text-night-50">{t('mover.company.addressConfirmed')}</Text>
            </View>
            <Button testID="company-address-change" variant="link-dark" className="ml-auto" title={t('mover.company.addressChange')} onPress={() => onChange(null)} />
          </View>
        ) : (
          <>
            <Text accessibilityRole="header" className="font-sans-semibold text-[15px] text-night-50">
              {t('mover.company.addressConfirmTitle')}
            </Text>
            {streetFromMap ? null : (
              <TextField
                testID="company-address-street"
                tone="dark"
                label={t('mover.company.street')}
                value={value.street ?? ''}
                onChangeText={(street) => edit({ street })}
                autoComplete="street-address"
              />
            )}
            <TextField
              testID="company-address-house-number"
              tone="dark"
              label={t('mover.company.houseNumber')}
              hint={t('mover.company.houseNumberHint')}
              value={value.houseNumber ?? ''}
              onChangeText={(houseNumber) => edit({ houseNumber: houseNumber.trim() === '' ? '' : houseNumber })}
              maxLength={20}
            />
            <Button
              testID="company-address-map"
              variant="link-dark"
              className="self-start"
              title={t('mover.company.addressOnMap')}
              onPress={() => void Linking.openURL(mapUrl(value))}
            />
            <Button testID="company-address-confirm" variant="accent" size="md" title={t('mover.company.addressConfirm')} onPress={() => onChange({ ...value, confirmed: true })} />
            <Button testID="company-address-search-again" variant="link-dark" className="self-start" title={t('mover.company.addressSearchAgain')} onPress={() => onChange(null)} />
          </>
        )}
      </View>
      {error ? (
        <Text aria-hidden className="font-sans text-[13px] text-danger-on-dark">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
