import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, ChipGroup, TextField, announce } from '@movershub/mobile';
import { DEFAULT_START_HOUR, moveDays, type BookingDraft } from '@movershub/shared';

import { BookingFrame, type UpdateBooking } from './booking-frame';
import { DayCalendar } from './day-calendar';
import { TimePicker } from './time-picker';

/** "09:30" — every MoversHub market writes times on the 24-hour clock. */
export const hourText = (hour: number, minute = 0) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/**
 * Step 3: the day (a calendar, from tomorrow, two months ahead), the time the mover arrives at the
 * pickup (set by hand, in quarter hours), and how many people carry (the mover included). Times are
 * the device's local time — every market is on Central European Time.
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
  const [days] = useState(() => moveDays(new Date()));
  const [tried, setTried] = useState(false);
  // A day kept from earlier that has passed counts as not chosen.
  const day = draft.day !== null && days.includes(draft.day) ? draft.day : null;
  const dayError = tried && day === null ? t('booking.when.dayRequired') : null;
  // The picker always shows a time: the one chosen, else the usual start, kept when going on.
  const hour = draft.hour ?? DEFAULT_START_HOUR;

  const next = () => {
    if (day !== null) {
      update((x) => ({ ...x, hour }));
      router.push('/book/size');
      return;
    }
    setTried(true);
    announce(t('booking.when.dayRequired'));
  };

  return (
    <>
      <Card variant="widget" className="gap-6">
        <DayCalendar days={days} value={day} label={t('booking.when.day')} error={dayError} onChange={(d) => update((x) => ({ ...x, day: d }))} />
        <TimePicker hour={hour} minute={draft.minute} label={t('booking.when.time')} onChange={(h, m) => update((x) => ({ ...x, hour: h, minute: m }))} />
        <Crew crew={draft.crew} asked={draft.crewAsked} onChange={(crew, crewAsked) => update((x) => ({ ...x, crew, crewAsked }))} />
      </Card>
      <Button testID="when-next" title={t('common.continue')} onPress={next} />
    </>
  );
}

type CrewSize = BookingDraft['crew'];
const CREW_SIZES: readonly CrewSize[] = [1, 2, 3];

/** "Custom" is for more people than the buttons offer. */
const CUSTOM_CREW_MIN = 4;

/**
 * How many people carry: the three usual choices, or "Custom" — any bigger number, typed by hand (the
 * buttons cover one to three, so a lower one is not taken). Movers can't set prices for more than
 * three people yet: the number is kept with the move and the prices are for three, and the screen says so.
 */
function Crew({ crew, asked, onChange }: { crew: CrewSize; asked: number | null; onChange: (crew: CrewSize, asked: number | null) => void }) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(asked !== null);
  const [typed, setTyped] = useState(asked === null ? '' : String(asked));
  const n = typed === '' ? null : Number(typed);
  const type = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setTyped(digits);
    const size = Number(digits);
    if (digits !== '' && size >= CUSTOM_CREW_MIN) onChange(3, size);
    else if (asked !== null) onChange(crew, null);
  };
  return (
    <View className="gap-2">
      <ChipGroup<CrewSize | 'custom'>
        testID="when-crew"
        label={t('booking.when.crew')}
        accessibilityLabel={t('booking.when.crew')}
        value={custom ? 'custom' : crew}
        options={[...CREW_SIZES.map((c) => ({ value: c, label: t(`landing.quote.crew${c}`) })), { value: 'custom' as const, label: t('booking.when.crewCustom') }]}
        onChange={(v) => {
          setCustom(v === 'custom');
          if (v !== 'custom') {
            setTyped('');
            onChange(v, null);
          }
        }}
      />
      {custom ? (
        <>
          <TextField
            testID="when-crew-number"
            label={t('booking.when.crewCustomLabel')}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            value={typed}
            onChangeText={type}
            error={n !== null && n < CUSTOM_CREW_MIN ? t('booking.when.crewCustomError') : undefined}
            hint={t('booking.when.crewCustomHint')}
          />
          {n !== null && n >= CUSTOM_CREW_MIN ? (
            <Text testID="when-crew-asked" accessibilityLiveRegion="polite" className="font-sans text-[13px] leading-[19px] text-ink-900">
              {t('booking.when.crewCustomSoon')}
            </Text>
          ) : null}
        </>
      ) : null}
      <Text className="font-sans text-[13px] leading-[19px] text-ink-600">{t('booking.when.crewHint')}</Text>
    </View>
  );
}
