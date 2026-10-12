import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';

import { currentLocale, cx, searchPlaces, useAuth } from '@ranktrip/mobile';
import type { GeoSuggestion, Place } from '@ranktrip/shared';
import { colors } from '@ranktrip/ui';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;
/** In the web build a tap blurs the input before it lands, so the list closes a moment later. */
const CLOSE_DELAY_MS = 150;

/** The places function's answer for one query; `items: null` = the search failed. */
type Answer = { q: string; items: GeoSuggestion[] | null };

/**
 * Address search (phone version of the website's address field). Suggestions come from the
 * `places` function (Photon on the server), biased towards the other address. Choosing one reports
 * a Place; typing alone never does — leaving the field shows the chosen address again.
 */
export function AddressField({
  label,
  placeholder,
  value,
  near,
  onSelect,
  testID,
}: {
  label: string;
  placeholder: string;
  value: Place;
  /** Bias results towards this point (the other address). */
  near?: Pick<Place, 'lat' | 'lon'>;
  onSelect: (place: Place) => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const locale = currentLocale();
  /** What the user is typing; null = not editing, the field shows the chosen place. */
  const [draft, setDraft] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [focused, setFocused] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Place changed from outside (popular route, swap): drop the half-typed search.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(null);
    setAnswer(null);
  }

  const query = draft?.trim() ?? '';
  const searching = draft !== null && query.length >= MIN_CHARS && query !== value.label;
  // Numbers, not the object, so a new `near` object doesn't restart the search.
  const nearLat = near?.lat;
  const nearLon = near?.lon;

  useEffect(() => {
    if (!searching) return;
    let stale = false; // a newer query replaced this one: its answer must not update the list
    const timer = setTimeout(() => {
      const bias = nearLat === undefined || nearLon === undefined ? undefined : { lat: nearLat, lon: nearLon };
      void searchPlaces(supabase, query, locale, bias).then(
        (items) => {
          if (!stale) setAnswer({ q: query, items });
        },
        () => {
          if (!stale) setAnswer({ q: query, items: null });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searching, query, locale, nearLat, nearLon, supabase]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const close = () => {
    setDraft(null);
    setAnswer(null);
  };

  const choose = (s: GeoSuggestion) => {
    clearTimeout(closeTimer.current);
    close();
    Keyboard.dismiss();
    onSelect({
      label: s.label,
      area: s.area,
      ...(s.district ? { district: s.district } : {}),
      lat: s.lat,
      lon: s.lon,
      countryCode: s.countryCode,
    });
  };

  // Only the answer to what is typed NOW is listed or taken by "Done" — while a newer query is
  // pending, an older query's suggestions would point to the wrong address.
  const results = answer && answer.q === query ? answer.items : undefined;
  const message =
    results === undefined
      ? t('landing.quote.searching')
      : results === null
        ? t('landing.quote.searchError')
        : results.length
          ? null
          : t('landing.quote.noResults');

  return (
    <View className="gap-1.5">
      <View
        className={cx(
          'rounded-input border-[1.5px] bg-stone-200 px-4 pt-2.5',
          focused ? 'border-brand-500' : 'border-stone-200',
        )}
      >
        {/* The input carries the label for screen readers. */}
        <Text aria-hidden className="font-sans text-xs text-ink-600">
          {label}
        </Text>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={draft ?? value.label}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.ink[500]}
          selectTextOnFocus
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            // Like Enter on the website: take the first suggestion (of the current query only).
            const first = searching ? results?.[0] : undefined;
            if (first) choose(first);
          }}
          onFocus={() => {
            clearTimeout(closeTimer.current);
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
            closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
          }}
          className="min-h-11 p-0 font-sans-medium text-[17px] text-ink-900"
        />
      </View>

      {searching ? (
        <View
          accessibilityRole="list"
          accessibilityLabel={label}
          accessibilityLiveRegion="polite"
          className="rounded-input border border-stone-300 bg-stone-50 p-1.5"
        >
          {message ? (
            <Text className={cx('px-3 py-2.5 font-sans text-sm', results === null ? 'text-danger' : 'text-ink-500')}>
              {message}
            </Text>
          ) : (
            results?.map((s) => <Suggestion key={s.id} place={s} onPress={() => choose(s)} />)
          )}
        </View>
      ) : null}
    </View>
  );
}

/** One suggestion: the place on the first line, the rest of the address under it (as on the website). */
function Suggestion({ place, onPress }: { place: GeoSuggestion; onPress: () => void }) {
  const [first, ...rest] = place.label.split(', ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={place.label}
      className="min-h-11 justify-center rounded-md px-3 py-2 active:bg-stone-200"
    >
      <Text className="font-sans-medium text-[15px] text-ink-900">{first}</Text>
      {rest.length ? <Text className="font-sans text-[12.5px] text-ink-600">{rest.join(', ')}</Text> : null}
    </Pressable>
  );
}
