import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Pill, currentLocale, cx, formatMoveDay } from '@movershub/mobile';
import { formatMoney, jobPlaces, localDay, moveState, routeLabel, type JobRow, type Locale, type MoveState } from '@movershub/shared';

import { useMyMoves } from '@/lib/moves';

import { hourText } from '../booking/when-screen';

/** States shown in a quiet pill: nothing is happening with the move. */
export const QUIET_STATES: readonly MoveState[] = ['QUOTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CANCELLED_BY_MOVER'];

/**
 * "Your moves" (design/DECISIONS.md #28): each saved or booked move — route, day and time, van size,
 * mover and their price, where it stands. Opens the move's own screen. On the home tab a row of cards
 * to swipe through (`strip`, with "View all"); on the Moves tab the full list, or `emptyText`.
 * Hidden while there is none (or while it loads) unless `emptyText` is given.
 */
export function MyMoves({ strip = false, emptyText, onViewAll }: { strip?: boolean; emptyText?: string; onViewAll?: () => void }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const moves = useMyMoves();
  if (!moves.data?.length) {
    return emptyText && moves.data ? (
      <Text testID="my-moves-none" className="font-sans text-[15px] leading-[22px] text-ink-600">
        {emptyText}
      </Text>
    ) : null;
  }
  const rows = moves.data.map((job) => <MoveRow key={job.id} job={job} locale={locale} card={strip} />);
  return (
    <View testID="my-moves" className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="font-sans-semibold text-[17px] text-ink-900">
          {t('customer.moves.title')}
        </Text>
        {onViewAll ? (
          <Pressable testID="my-moves-all" accessibilityRole="button" onPress={onViewAll} className="min-h-11 justify-center px-1 active:opacity-60">
            <Text className="font-sans-medium text-[13px] text-accent-700">{t('customer.viewAll')} ›</Text>
          </Pressable>
        ) : null}
      </View>
      {strip ? (
        // Bleeds to the screen's edges, so the next card peeks in.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4" contentContainerClassName="gap-3 px-4">
          {rows}
        </ScrollView>
      ) : (
        rows
      )}
    </View>
  );
}

function MoveRow({ job, locale, card }: { job: JobRow; locale: Locale; card: boolean }) {
  const { t } = useTranslation();
  const [pickup, dropoff] = jobPlaces(job);
  const at = new Date(job.scheduled_at);
  const quote = job.quotes[0];
  const route = routeLabel(pickup, dropoff, (city) => t('landing.quote.withinCity', { city }));
  const when = `${formatMoveDay(localDay(at), locale)}, ${hourText(at.getHours(), at.getMinutes())} · ${t(`vehicles.${job.vehicle_class}.name`)}`;
  const mover = [quote?.mover?.name, quote ? formatMoney(quote.mover_price, quote.currency, locale) : null].filter(Boolean).join(' · ');
  const state = moveState(job);
  const status = t(`customer.moves.status.${state}`);
  return (
    <Pressable
      testID={`move-${job.id}`}
      onPress={() => router.push({ pathname: '/moves/[id]', params: { id: job.id } })}
      accessibilityRole="button"
      accessibilityLabel={[route, when, mover, status].filter(Boolean).join(', ')}
      className={cx('gap-1 rounded-card bg-stone-50 px-4 py-3.5 shadow-card active:opacity-80', card ? 'w-64' : 'w-full')}
    >
      <View className={cx('gap-2', card ? 'items-start' : 'flex-row flex-wrap items-center justify-between')}>
        {card ? (
          <Pill size="sm" tone={QUIET_STATES.includes(state) ? 'neutral' : 'brand'}>
            {status}
          </Pill>
        ) : null}
        <Text className="font-sans-semibold text-[15px] text-ink-900" numberOfLines={card ? 1 : undefined}>
          {route}
        </Text>
        {card ? null : (
          <Pill size="sm" tone={QUIET_STATES.includes(state) ? 'neutral' : 'brand'}>
            {status}
          </Pill>
        )}
      </View>
      <Text className="font-sans text-[13px] text-ink-700" numberOfLines={card ? 1 : undefined}>
        {when}
      </Text>
      {mover ? (
        <Text className="font-sans text-[13px] text-ink-600" numberOfLines={card ? 1 : undefined}>
          {mover}
        </Text>
      ) : null}
    </Pressable>
  );
}
