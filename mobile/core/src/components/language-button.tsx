import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

import { LOCALES, LOCALE_NAMES, resolveLocale, type Locale } from '@movershub/i18n';

import { useAuth } from '../auth-provider';
import { setLocale } from '../i18n';
import { cx } from './cx';
import { Button } from './ui';

/**
 * "EN ▾" in the top bar: the app's language, like the website's language menu. The choice applies at
 * once, is kept on this device and, when someone is signed in, saved with their account
 * (`profiles.locale`) for the messages they get later.
 */
export function LanguageButton({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { t, i18n } = useTranslation();
  const { supabase, session } = useAuth();
  const [open, setOpen] = useState(false);
  const current = resolveLocale(i18n.language);

  const choose = (locale: Locale) => {
    setOpen(false);
    if (locale === current) return;
    void setLocale(locale);
    // A Supabase query runs only once awaited (`then`); a failure here only means the account keeps the old one.
    if (session) void supabase.from('profiles').update({ locale }).eq('id', session.user.id).then(() => undefined);
  };

  return (
    <>
      <Pressable
        testID="language-button"
        accessibilityRole="button"
        accessibilityLabel={`${t('common.language')}: ${LOCALE_NAMES[current]}`}
        onPress={() => setOpen(true)}
        className="min-h-11 min-w-11 flex-row items-center justify-center gap-1 rounded-full px-2 active:opacity-60"
      >
        <Text className={cx('font-sans-medium text-sm', tone === 'dark' ? 'text-night-50' : 'text-ink-900')}>
          {current.toUpperCase()}
        </Text>
        <Text aria-hidden className={cx('font-sans text-xs', tone === 'dark' ? 'text-sage-400' : 'text-ink-500')}>
          ▾
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Tapping outside the list closes it. */}
        <Pressable
          accessible={false}
          onPress={() => setOpen(false)}
          className="flex-1 items-center justify-center bg-ink-900/40 px-4"
        >
          <Pressable onPress={() => undefined} className="w-full max-w-sm gap-1 rounded-xl bg-stone-50 p-2 shadow-sheet">
            <Text accessibilityRole="header" className="px-3 pb-1 pt-2 font-sans-medium text-base text-ink-900">
              {t('common.language')}
            </Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('common.language')} className="gap-0.5">
              {LOCALES.map((locale) => {
                const selected = locale === current;
                return (
                  <Pressable
                    key={locale}
                    testID={`language-${locale}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    aria-checked={selected}
                    accessibilityLanguage={locale}
                    onPress={() => choose(locale)}
                    className={cx(
                      'min-h-12 flex-row items-center justify-between rounded-md px-3 active:bg-stone-200',
                      selected && 'bg-stone-150',
                    )}
                  >
                    <Text className={cx('text-base text-ink-900', selected ? 'font-sans-medium' : 'font-sans')}>
                      {LOCALE_NAMES[locale]}
                    </Text>
                    <Text aria-hidden className="font-mono text-xs text-ink-500">
                      {selected ? '✓ ' : ''}
                      {locale.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button testID="language-close" variant="link" className="self-center" title={t('common.close')} onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
