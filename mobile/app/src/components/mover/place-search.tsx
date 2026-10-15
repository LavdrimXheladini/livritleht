import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DEMO_CITIES, type GeoSuggestion, type MoverCountry } from '@movershub/shared';
import { currentLocale, cx, searchPlaces, useAuth } from '@movershub/mobile';
import { colors } from '@movershub/ui';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

/** The country's biggest city: searches start near it (Prishtina, Tirana, Skopje, Warsaw…). */
const nearCountry = (country: MoverCountry | undefined) => DEMO_CITIES.find((c) => c.countryCode === country);

/**
 * Map search on the mover's dark screens (OpenStreetMap through the `places` function, signed-in only):
 * type at least 3 letters, pick a suggestion. Used for the company address and the work-area towns.
 * Test ids: `<testIDPrefix>-search`, `<testIDPrefix>-suggestion`.
 */
export function PlaceSearch({
  label,
  placeholder,
  hint,
  country,
  error,
  onChoose,
  testIDPrefix,
}: {
  label: string;
  placeholder: string;
  /** Under the field while nothing is searched. */
  hint?: string;
  /** Results near this country come first. */
  country: MoverCountry | undefined;
  error?: string | undefined;
  onChoose: (place: GeoSuggestion) => void;
  testIDPrefix: string;
}) {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const locale = currentLocale();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<{ q: string; items: GeoSuggestion[] | null } | null>(null);
  const q = query.trim();
  const searching = q.length >= MIN_CHARS;
  const near = nearCountry(country);
  const nearLat = near?.lat;
  const nearLon = near?.lon;

  useEffect(() => {
    if (!searching) return;
    let stale = false;
    const timer = setTimeout(() => {
      const bias = nearLat === undefined || nearLon === undefined ? undefined : { lat: nearLat, lon: nearLon };
      void searchPlaces(supabase, q, locale, bias).then(
        (items) => {
          if (!stale) setAnswer({ q, items });
        },
        () => {
          if (!stale) setAnswer({ q, items: null });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searching, q, locale, nearLat, nearLon, supabase]);

  const results = answer && answer.q === q ? answer.items : undefined;
  const message =
    results === undefined
      ? t('landing.quote.searching')
      : results === null
        ? t('landing.quote.searchError')
        : results.length
          ? null
          : t('landing.quote.noResults');

  const choose = (s: GeoSuggestion) => {
    setQuery('');
    setAnswer(null);
    onChoose(s);
  };

  return (
    <View className="gap-1.5">
      <Text aria-hidden className="font-sans text-[13px] text-sage-400">
        {label}
      </Text>
      <TextInput
        testID={`${testIDPrefix}-search`}
        accessibilityLabel={[label, error].filter(Boolean).join(', ')}
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor={colors.sage[500]}
        autoComplete="off"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="search"
        onSubmitEditing={() => {
          const first = searching ? results?.[0] : undefined;
          if (first) choose(first);
        }}
        className={cx(
          'min-h-[52px] rounded-input border bg-night-800 px-4 font-sans text-base text-night-50',
          error ? 'border-danger-on-dark' : 'border-night-600',
        )}
      />
      {searching ? (
        <View accessibilityRole="list" accessibilityLabel={label} accessibilityLiveRegion="polite" className="rounded-input border border-night-600 bg-night-800 p-1.5">
          {message ? (
            <Text className={cx('px-3 py-2.5 font-sans text-sm', results === null ? 'text-danger-on-dark' : 'text-sage-400')}>{message}</Text>
          ) : (
            results?.map((s) => <Suggestion key={s.id} testID={`${testIDPrefix}-suggestion`} place={s} onPress={() => choose(s)} />)
          )}
        </View>
      ) : hint ? (
        <Text aria-hidden className="font-sans text-[13px] text-sage-400">
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text aria-hidden className="font-sans text-[13px] text-danger-on-dark">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Suggestion({ place, onPress, testID }: { place: GeoSuggestion; onPress: () => void; testID: string }) {
  const [first, ...rest] = place.label.split(', ');
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={place.label}
      className="min-h-11 justify-center rounded-md px-3 py-2 active:bg-night-700"
    >
      <Text className="font-sans-medium text-[15px] text-night-50">{first}</Text>
      {rest.length ? <Text className="font-sans text-[12.5px] text-sage-400">{rest.join(', ')}</Text> : null}
    </Pressable>
  );
}
