import type { ComponentType } from 'react';
import { Text, View } from 'react-native';

import { Pill, type IconProps } from '@ranktrip/mobile';
import { colors } from '@ranktrip/ui';

/**
 * Copper icon + title + text, like the website's mover feature list. Screen readers read it as one
 * item; `badge` adds a small pill on the right (e.g. "Coming next").
 */
export function IconRow({
  icon: Icon,
  title,
  text,
  badge,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <View accessible className="flex-row items-start gap-3.5">
      <Icon size={20} color={colors.accent[300]} />
      <View className="flex-1 gap-1">
        <Text className="font-sans-semibold text-[15px] text-night-50">{title}</Text>
        <Text className="font-sans text-[14px] leading-[20px] text-sage-400">{text}</Text>
      </View>
      {badge ? (
        <Pill tone="dark-muted" size="sm">
          {badge}
        </Pill>
      ) : null}
    </View>
  );
}
