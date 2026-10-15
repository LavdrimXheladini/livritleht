import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { Pill, currentLocale, formatMoveDay } from '@movershub/mobile';
import { formatMoney, jobPlaces, localDay, routeLabel, type JobRow, type Locale } from '@movershub/shared';

import { useMyMoves } from '@/lib/moves';

import { hourText } from '../booking/when-screen';

/**
 * "Your moves" on the customer home (design/DECISIONS.md #28): each saved or booked move — route, day
 * and time, van size, mover and their price, where it stands. Opens the move's own screen. Hidden
 * while there is none (or while it loads).
 */
export function MyMoves() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const moves = useMyMoves();
  if (!moves.data?.length) return null;
  return (
    <View testID="my-moves" className="gap-3">
      <Text accessibilityRole="header" className="font-sans-medium text-base text-ink-900">
        {t('customer.moves.title')}
      </Text>
      {moves.data.map((job) => (
        <MoveRow key={job.id} job={job} locale={locale} />
      ))}
    </View>
  );
}

function MoveRow({ job, locale }: { job: JobRow; locale: Locale }) {
  const { t } = useTranslation();
  const [pickup, dropoff] = jobPlaces(job);
  const at = new Date(job.scheduled_at);
  const quote = job.quotes[0];
  const route = routeLabel(pickup, dropoff, (city) => t('landing.quote.withinCity', { city }));
  const when = `${formatMoveDay(localDay(at), locale)}, ${hourText(at.getHours())} · ${t(`vehicles.${job.vehicle_class}.name`)}`;
  const mover = [quote?.mover?.name, quote ? formatMoney(quote.mover_price, quote.currency, locale) : null].filter(Boolean).join(' · ');
  const status = t(`customer.moves.status.${job.status}`);
  return (
    <Pressable
      testID={`move-${job.id}`}
      onPress={() => router.push({ pathname: '/moves/[id]', params: { id: job.id } })}
      accessibilityRole="button"
      accessibilityLabel={[route, when, mover, status].filter(Boolean).join(', ')}
      className="gap-1 rounded-input border border-stone-300 bg-stone-50 px-4 py-3 active:border-ink-300"
    >
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="font-sans-semibold text-[15px] text-ink-900">{route}</Text>
        <Pill size="sm" tone={job.status === 'QUOTED' ? 'neutral' : 'brand'}>
          {status}
        </Pill>
      </View>
      <Text className="font-sans text-[13px] text-ink-700">{when}</Text>
      {mover ? <Text className="font-sans text-[13px] text-ink-600">{mover}</Text> : null}
    </Pressable>
  );
}
