import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { LEGAL_UPDATED, legalDocument, resolveLocale, type LegalDocId, type Locale } from '@movershub/i18n';
import { Button, Display, Screen } from '@movershub/mobile';
import { INTL_LOCALES, formatLocalDay } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { usePublishedTerms } from '@/lib/terms';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function formatDay(day: string, locale: Locale) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
}

/**
 * A legal page in the app — privacy policy, terms for customers, terms for movers, contact and legal
 * notice (design/DECISIONS.md #33): the same text as on the website, from packages/i18n. Open signed
 * in or out. A DRAFT until a lawyer has checked it, and in English until translated: it says both.
 */
export function LegalScreen({ doc, version }: { doc: LegalDocId; version?: string | undefined }) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const fromCode = legalDocument(doc, locale);
  // A published version of the terms (design/DECISIONS.md #34): exactly the text people accept.
  const published = usePublishedTerms(version);
  // Published with the operator's details as they were then: shown exactly as accepted.
  const shown = version && published.data ? { text: published.data.content.text, locale: resolveLocale(published.data.content.locale) } : fromCode;
  const { text, locale: textLocale } = shown;

  if (version && !published.data) {
    return (
      <Screen>
        <Button testID="legal-back" variant="link" className="-ml-2 self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={goBack} />
        <Display>{t(`legal.titles.${doc}`)}</Display>
        {published.isError ? (
          <Text testID="legal-version-unavailable" className="font-sans text-base text-ink-700">
            {t('terms.versionUnavailable')}
          </Text>
        ) : (
          <ActivityIndicator color={colors.brand[500]} accessibilityLabel={t('common.loading')} />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Button testID="legal-back" variant="link" className="-ml-2 self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={goBack} />
      <Display>{t(`legal.titles.${doc}`)}</Display>
      {version && published.data ? (
        <Text testID="legal-version" className="font-sans text-[15px] text-ink-700">
          {t('terms.versionLine', { version: published.data.version, date: formatLocalDay(published.data.effective_at) })}
        </Text>
      ) : null}
      <View className="gap-2">
        <Text testID="legal-draft" className="rounded-lg bg-accent-200 p-3 font-sans text-sm leading-5 text-ink-900">
          {t('legal.draft')}
        </Text>
        {textLocale !== locale ? (
          <Text testID="legal-english-only" className="rounded-lg bg-stone-150 p-3 font-sans text-sm leading-5 text-ink-900">
            {t('legal.englishOnly')}
          </Text>
        ) : null}
      </View>

      <Text className="font-sans text-base leading-6 text-ink-900">{text.intro}</Text>
      {text.sections.map((section) => (
        <View key={section.id} testID={`legal-section-${section.id}`} className="gap-2">
          <Text accessibilityRole="header" className="font-sans-semibold text-lg text-ink-900">
            {section.heading}
          </Text>
          {section.blocks.map((block, i) =>
            typeof block === 'string' ? (
              <Text key={i} className="font-sans text-[15px] leading-[22px] text-ink-700">
                {block}
              </Text>
            ) : 'list' in block ? (
              <View key={i} accessibilityRole="list" className="gap-1.5">
                {block.list.map((item) => (
                  <View key={item} className="flex-row gap-2">
                    <Text aria-hidden className="font-sans text-[15px] leading-[22px] text-ink-700">
                      •
                    </Text>
                    <Text className="flex-1 font-sans text-[15px] leading-[22px] text-ink-700">{item}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Button
                key={i}
                testID={`legal-see-${block.see}`}
                variant="link"
                className="-ml-2 self-start"
                title={t(`legal.titles.${block.see}`)}
                onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: block.see } })}
              />
            ),
          )}
        </View>
      ))}
      <Text className="font-sans text-[13px] text-ink-600">{t('legal.updated', { date: formatDay(LEGAL_UPDATED, locale) })}</Text>
    </Screen>
  );
}

/** Links to legal pages (e.g. under the sign-in form, or in "Your account"). */
export function LegalLinks({ docs, testID }: { docs: readonly LegalDocId[]; testID?: string }) {
  const { t } = useTranslation();
  return (
    <View testID={testID} accessibilityRole="list" className="flex-row flex-wrap gap-x-2">
      {docs.map((doc) => (
        <Button
          key={doc}
          testID={`legal-link-${doc}`}
          variant="link"
          title={t(`legal.titles.${doc}`)}
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })}
        />
      ))}
    </View>
  );
}
