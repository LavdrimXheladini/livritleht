import { Linking, Pressable, Text } from 'react-native';

import { cx } from '@movershub/mobile';

/**
 * A link that leaves the app — a stop in the phone's maps app, the phone's dialler. `fallback` is opened
 * when the phone has no app for `href` (e.g. `geo:` links on some Android phones).
 */
export function ExternalLink({
  href,
  fallback,
  title,
  hint,
  testID,
  tone = 'dark',
  className,
}: {
  href: string;
  fallback?: string;
  title: string;
  hint?: string;
  testID?: string;
  tone?: 'dark' | 'light';
  className?: string;
}) {
  const open = async () => {
    try {
      await Linking.openURL(href);
    } catch {
      if (fallback) await Linking.openURL(fallback).catch(() => undefined);
    }
  };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityHint={hint}
      onPress={() => void open()}
      className={cx('min-h-11 min-w-11 justify-center self-start', className)}
    >
      <Text className={cx('font-sans-medium text-[14px] underline', tone === 'dark' ? 'text-accent-300' : 'text-ink-900')}>{title}</Text>
    </Pressable>
  );
}
