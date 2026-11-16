import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { ChevronRightIcon, cx } from '@movershub/mobile';
import { MOVE_START_HOURS, MOVE_START_MINUTES, type MoveStartMinute } from '@movershub/shared';
import { colors } from '@movershub/ui';

const pad = (n: number) => String(n).padStart(2, '0');
const FIRST_HOUR = MOVE_START_HOURS[0];
const LAST_HOUR = MOVE_START_HOURS[MOVE_START_HOURS.length - 1]!;
const TIME_TEXT = 'font-display text-[34px] leading-[42px] text-ink-900';

/**
 * The arrival time, set by hand: the hour (within the hours movers start) and the minutes in quarter
 * hours, each with an arrow up and down. 24-hour clock, as every MoversHub market writes times.
 */
export function TimePicker({
  hour,
  minute,
  onChange,
  label,
}: {
  hour: number;
  minute: MoveStartMinute;
  onChange: (hour: number, minute: MoveStartMinute) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const turnMinute = (by: 1 | -1) => {
    const i = MOVE_START_MINUTES.indexOf(minute);
    onChange(hour, MOVE_START_MINUTES[(i + by + MOVE_START_MINUTES.length) % MOVE_START_MINUTES.length]!);
  };
  return (
    <View className="gap-2">
      <Text className="font-sans text-[13px] text-ink-600">{label}</Text>
      <View testID="when-time" accessibilityLabel={`${label}: ${pad(hour)}:${pad(minute)}`} className="flex-row items-center justify-center gap-3 rounded-[22px] bg-stone-150 py-2">
        <Wheel
          testID="when-hour"
          name={t('booking.when.hour')}
          text={pad(hour)}
          onUp={hour < LAST_HOUR ? () => onChange(hour + 1, minute) : null}
          onDown={hour > FIRST_HOUR ? () => onChange(hour - 1, minute) : null}
        />
        <Text aria-hidden className={TIME_TEXT}>
          :
        </Text>
        <Wheel testID="when-minute" name={t('booking.when.minutes')} text={pad(minute)} onUp={() => turnMinute(1)} onDown={() => turnMinute(-1)} />
      </View>
    </View>
  );
}

/** One part of the time: later (up), the value, earlier (down). `null` = no further that way. */
function Wheel({ testID, name, text, onUp, onDown }: { testID: string; name: string; text: string; onUp: (() => void) | null; onDown: (() => void) | null }) {
  const { t } = useTranslation();
  return (
    <View className="items-center">
      <Arrow testID={`${testID}-up`} label={`${t('booking.when.later')}: ${name}`} turn="-90deg" onPress={onUp} />
      <Text testID={`${testID}-value`} accessibilityLabel={`${name}: ${text}`} accessibilityLiveRegion="polite" className={cx(TIME_TEXT, 'min-w-[64px] text-center')}>
        {text}
      </Text>
      <Arrow testID={`${testID}-down`} label={`${t('booking.when.earlier')}: ${name}`} turn="90deg" onPress={onDown} />
    </View>
  );
}

function Arrow({ testID, label, turn, onPress }: { testID: string; label: string; turn: string; onPress: (() => void) | null }) {
  const disabled = onPress === null;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress ?? undefined}
      className={cx('size-11 items-center justify-center rounded-full active:bg-stone-200', disabled && 'opacity-30')}
    >
      <View style={{ transform: [{ rotate: turn }] }}>
        <ChevronRightIcon size={20} color={colors.ink[900]} />
      </View>
    </Pressable>
  );
}
