import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, ChipGroup, CrewPills, announce, currentLocale, formatMoveDay } from '@movershub/mobile';
import { MOVE_START_HOURS, moveDays, type BookingDraft } from '@movershub/shared';

import { BookingFrame, type UpdateBooking } from './booking-frame';

/** "09:00" — every MoversHub market writes times on the 24-hour clock. */
export const hourText = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/**
 * Step 3: the day (from tomorrow, two months ahead), the time the mover arrives at the pickup, and
 * how many people carry (the mover included). Times are the device's local time — every market is
 * on Central European Time.
 */
export function WhenScreen() {
  const { t } = useTranslation();
  return (
    <BookingFrame step={2} title={t('booking.when.title')} subtitle={t('booking.when.subtitle')}>
      {(draft, update) => <When draft={draft} update={update} />}
    </BookingFrame>
  );
}

function When({ draft, update }: { draft: BookingDraft; update: UpdateBooking }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const [days] = useState(() => moveDays(new Date()));
  const [tried, setTried] = useState(false);
  // A day kept from earlier that has passed counts as not chosen.
  const day = draft.day !== null && days.includes(draft.day) ? draft.day : null;
  const dayError = tried && day === null ? t('booking.when.dayRequired') : null;
  const timeError = tried && draft.hour === null ? t('booking.when.timeRequired') : null;

  const next = () => {
    if (day !== null && draft.hour !== null) {
      router.push('/book/size');
      return;
    }
    setTried(true);
    announce([day === null ? t('booking.when.dayRequired') : null, draft.hour === null ? t('booking.when.timeRequired') : null].filter(Boolean).join(' '));
  };

  return (
    <>
      <Card variant="widget" className="gap-5">
        <View className="gap-1.5">
          <ChipGroup
            testID="when-day"
            label={t('booking.when.day')}
            accessibilityLabel={[t('booking.when.day'), dayError].filter(Boolean).join(', ')}
            wrap={false}
            value={day}
            options={days.map((d) => ({ value: d, label: formatMoveDay(d, locale) }))}
            onChange={(d) => update((x) => ({ ...x, day: d }))}
          />
          {dayError ? (
            <Text aria-hidden className="font-sans text-[13px] text-danger">
              {dayError}
            </Text>
          ) : null}
        </View>
        <View className="gap-1.5">
          <ChipGroup
            testID="when-hour"
            label={t('booking.when.time')}
            accessibilityLabel={[t('booking.when.time'), timeError].filter(Boolean).join(', ')}
            value={draft.hour}
            options={MOVE_START_HOURS.map((h) => ({ value: h, label: hourText(h) }))}
            onChange={(h) => update((x) => ({ ...x, hour: h }))}
          />
          {timeError ? (
            <Text aria-hidden className="font-sans text-[13px] text-danger">
              {timeError}
            </Text>
          ) : null}
        </View>
        <View className="gap-2">
          <CrewPills
            value={draft.crew}
            onChange={(crew) => update((x) => ({ ...x, crew }))}
            groupLabel={t('booking.when.crew')}
            labels={{ 1: t('landing.quote.crew1'), 2: t('landing.quote.crew2'), 3: t('landing.quote.crew3') }}
          />
          <Text className="font-sans text-[13px] leading-[19px] text-ink-600">{t('booking.when.crewHint')}</Text>
        </View>
      </Card>
      <Button testID="when-next" title={t('common.continue')} onPress={next} />
    </>
  );
}
