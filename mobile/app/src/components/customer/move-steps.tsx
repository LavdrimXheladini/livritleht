import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Card, currentLocale, cx, formatClockTime, formatMoveDay } from '@movershub/mobile';
import { localDay, type JobDay } from '@movershub/shared';

/** "08:47", or "Tue 20 Oct, 08:47" when it wasn't today (a move across a border can take days). */
export function stepTime(iso: string, locale: ReturnType<typeof currentLocale>, today = localDay(new Date())) {
  const day = localDay(new Date(iso));
  return day === today ? formatClockTime(iso, locale) : `${formatMoveDay(day, locale)}, ${formatClockTime(iso, locale)}`;
}

/**
 * The move day as the customer follows it (design/DECISIONS.md #36): each step the mover marked, with its
 * time, then the ones still to come; done dots filled, the current one copper, future ones hollow.
 */
export function MoveSteps({ day }: { day: JobDay }) {
  const { t: tj } = useTranslation('job');
  const locale = currentLocale();
  const today = localDay(new Date());
  const current = day.steps.findIndex((s) => s.at === null) - 1;
  return (
    <Card variant="widget" className="gap-3">
      <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
        {tj('customer.stepsTitle')}
      </Text>
      <View testID="move-steps" accessibilityRole="list" className="gap-2.5">
        {day.steps.map((s, i) => {
          const name = tj(`customer.steps.${s.status}`);
          const done = s.at !== null;
          const now = i === (current < 0 ? day.steps.length - 1 : current) && !day.cancelled;
          return (
            <View
              key={s.status}
              testID={`move-step-${s.status}`}
              accessible
              accessibilityLabel={done && s.at ? tj('customer.stepDone', { step: name, time: stepTime(s.at, locale, today) }) : tj('customer.stepNotYet', { step: name })}
              className="flex-row items-center gap-3"
            >
              <View
                className={cx(
                  'h-3 w-3 rounded-full border-2',
                  now ? 'border-accent-500 bg-accent-500' : done ? 'border-brand-500 bg-brand-500' : 'border-stone-400 bg-stone-50',
                )}
              />
              <Text className={cx('flex-1 font-sans text-[13.5px]', done ? 'text-ink-900' : 'text-ink-600')}>{name}</Text>
              {done && s.at ? <Text className="font-sans text-[12.5px] text-ink-600">{stepTime(s.at, locale, today)}</Text> : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}
