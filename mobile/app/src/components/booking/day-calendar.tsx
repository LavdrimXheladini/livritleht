import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { ChevronRightIcon, currentLocale, cx, formatMoveDay } from '@movershub/mobile';
import { INTL_LOCALES } from '@movershub/shared';
import { colors } from '@movershub/ui';

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-10" of a day "2026-10-16". */
const monthOf = (day: string) => day.slice(0, 7);

/** The month's weeks, Monday first: day numbers, `null` before the 1st and after the last day. */
function monthCells(month: string): (number | null)[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const before = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const count = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(before).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * A month calendar for the move's day. Only `days` (the days a move can be booked, YYYY-MM-DD) can be
 * chosen; the months shown are theirs. Opens on the chosen day's month, else the first one.
 */
export function DayCalendar({
  days,
  value,
  onChange,
  label,
  error,
}: {
  days: readonly string[];
  value: string | null;
  onChange: (day: string) => void;
  label: string;
  error: string | null;
}) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const intl = INTL_LOCALES[locale];
  const months = [...new Set(days.map(monthOf))];
  const [shown, setShown] = useState(() => Math.max(0, months.indexOf(monthOf(value ?? days[0] ?? ''))));
  const month = months[shown] ?? months[0];
  if (!month) return null;
  const [y, m] = month.split('-').map(Number) as [number, number];
  const title = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  // 1 January 2024 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(intl, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)));
  const open = new Set(days);
  const cells = monthCells(month);

  return (
    <View className="gap-2">
      <Text className="font-sans text-[13px] text-ink-600">{label}</Text>
      <View className="flex-row items-center justify-between">
        <MonthButton testID="when-month-prev" label={t('booking.when.prevMonth')} back disabled={shown === 0} onPress={() => setShown(shown - 1)} />
        <Text testID="when-month" accessibilityRole="header" accessibilityLiveRegion="polite" className="font-sans-semibold text-base capitalize text-ink-900">
          {title}
        </Text>
        <MonthButton testID="when-month-next" label={t('booking.when.nextMonth')} disabled={shown >= months.length - 1} onPress={() => setShown(shown + 1)} />
      </View>
      <View aria-hidden className="flex-row">
        {weekdays.map((w) => (
          <Text key={w} className="flex-1 text-center font-sans text-[12px] text-ink-500">
            {w}
          </Text>
        ))}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={[label, error].filter(Boolean).join(', ')} className="flex-row flex-wrap">
        {cells.map((n, i) => {
          const day = n === null ? null : `${month}-${pad(n)}`;
          const can = day !== null && open.has(day);
          const on = day !== null && day === value;
          return (
            <View key={i} style={{ width: `${100 / 7}%` }} className="items-center py-0.5">
              {day === null ? (
                <View className="size-11" />
              ) : can ? (
                <Pressable
                  testID={`when-day-${day}`}
                  accessibilityRole="radio"
                  accessibilityLabel={formatMoveDay(day, locale, { long: true })}
                  accessibilityState={{ selected: on, checked: on }}
                  aria-checked={on}
                  onPress={() => onChange(day)}
                  className={cx('size-11 items-center justify-center rounded-full', on ? 'bg-brand-500' : 'active:bg-stone-150')}
                >
                  <Text className={cx('text-[15px]', on ? 'font-sans-semibold text-stone-50' : 'font-sans-medium text-ink-900')}>{n}</Text>
                </Pressable>
              ) : (
                <View aria-hidden className="size-11 items-center justify-center">
                  <Text className="font-sans text-[15px] text-ink-300">{n}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      {error ? (
        <Text aria-hidden className="font-sans text-[13px] text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function MonthButton({ testID, label, back = false, disabled, onPress }: { testID: string; label: string; back?: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cx('size-11 items-center justify-center rounded-full bg-stone-150 active:bg-stone-200', disabled && 'opacity-40')}
    >
      <View style={back ? { transform: [{ rotate: '180deg' }] } : undefined}>
        <ChevronRightIcon size={18} color={colors.ink[900]} />
      </View>
    </Pressable>
  );
}
