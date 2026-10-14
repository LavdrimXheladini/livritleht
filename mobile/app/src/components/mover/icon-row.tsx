import type { ComponentType } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChevronRightIcon, Pill, type IconProps, type PillTone } from '@movershub/mobile';
import { colors } from '@movershub/ui';

/**
 * Copper icon + title + text, like the website's mover feature list. Screen readers read it as one
 * item; `badge` adds a small pill on the right (e.g. "Coming next"). With `onPress` the whole row is
 * a button that opens the step (chevron on the right).
 */
export function IconRow({
  icon: Icon,
  title,
  text,
  badge,
  badgeTone = 'dark-muted',
  onPress,
  testID,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  text: string;
  badge?: string | undefined;
  badgeTone?: PillTone;
  onPress?: () => void;
  testID?: string;
}) {
  const content = (
    <>
      <Icon size={20} color={colors.accent[300]} />
      <View className="flex-1 gap-1">
        <Text className="font-sans-semibold text-[15px] text-night-50">{title}</Text>
        <Text className="font-sans text-[14px] leading-[20px] text-sage-400">{text}</Text>
      </View>
      {badge ? (
        <Pill tone={badgeTone} size="sm">
          {badge}
        </Pill>
      ) : null}
      {onPress ? <ChevronRightIcon size={18} color={colors.sage[400]} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View accessible className="flex-row items-start gap-3.5">
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, text, badge].filter(Boolean).join(', ')}
      className="min-h-11 flex-row items-start gap-3.5 rounded-md active:bg-night-700"
    >
      {content}
    </Pressable>
  );
}
