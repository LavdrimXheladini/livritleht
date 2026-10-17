import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, type TextProps } from 'react-native';

import { cx } from '@movershub/mobile';

/** react-native-web renders a Text with `href` as a real link (<a>). */
const LinkText = Text as unknown as ComponentType<TextProps & { href: string; hrefAttrs?: { target?: string; rel?: string } }>;

/** The browser version: a real link; web pages open in a new tab (and say so to screen readers). */
export function ExternalLink({
  href,
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
  const { t } = useTranslation('job');
  const page = /^https?:/.test(href);
  return (
    <LinkText
      testID={testID}
      href={href}
      hrefAttrs={page ? { target: '_blank', rel: 'noopener noreferrer' } : undefined}
      accessibilityLabel={page ? `${title} ${t('newTab')}` : title}
      accessibilityHint={hint}
      className={cx(
        'min-h-11 self-start py-3 font-sans-medium text-[14px] underline',
        tone === 'dark' ? 'text-accent-300' : 'text-ink-900',
        className,
      )}
    >
      {title}
    </LinkText>
  );
}
