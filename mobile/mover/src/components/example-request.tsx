import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Text, View } from 'react-native';

import { Button, CheckIcon, DarkPanel, Display, Pill, classFrom, useQuote } from '@movershub/mobile';
import {
  PLATFORM_TAKE_RATE_PCT,
  demoPlace,
  formatMoney,
  formatNumber,
  resolveLocale,
  routeLabel,
  stopName,
  type VehicleClass,
} from '@movershub/shared';
import { colors } from '@movershub/ui';

import { RouteSketch } from './route-sketch';

// The website's default quote: a large van, mover + 1 helper, Prishtina → Prizren.
const VEHICLE = 'LARGE_VAN' satisfies VehicleClass;
const CREW = 2;

type Answer = 'accepted' | 'declined';

/**
 * Example job request, like the website's mover phone (landing/mover-phone.tsx).
 * COMPLIANCE: price and Payout only from the live server quote, '—' while it loads or fails (§1.1);
 * city / neighbourhood only before accepting (§9.1); declining has no consequence (§2); "Payout" (§12).
 */
export function ExampleRequest() {
  const { t, i18n } = useTranslation();
  // From i18n.language, not currentLocale(): React Compiler then re-formats when the language changes.
  const locale = resolveLocale(i18n.language);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const pickup = demoPlace('prishtina', t('places.prishtina'));
  const dropoff = demoPlace('prizren', t('places.prizren'));
  const { data: quote } = useQuote(pickup, dropoff);

  // The cheapest offer in the class: that mover's own price and their Payout.
  const offer = quote ? classFrom(quote, VEHICLE, CREW, pickup) : null;
  // To the cent, never rounded (COMPLIANCE §13).
  const money = (key: 'payout' | 'moverPrice') => (offer ? formatMoney(offer[key], offer.currency, locale) : '—');
  const pct = quote ? PLATFORM_TAKE_RATE_PCT[quote.crossBorder ? 'crossBorder' : 'domestic'] : '—';

  const reply = (next: Answer) => {
    setAnswer(next);
    // The website's role="status": the pressed button is gone, so say what happened.
    AccessibilityInfo.announceForAccessibility(
      t(next === 'accepted' ? 'landing.movers.phone.acceptedTitle' : 'landing.movers.phone.declinedTitle'),
    );
  };

  return (
    <DarkPanel className="gap-3">
      <Pill tone="accent-soft" size="sm">
        {t('landing.movers.phone.online')}
      </Pill>
      {answer ? null : (
        <Display size={24} tone="dark">
          {t('landing.movers.phone.newRequest')}
        </Display>
      )}
      <Text className="font-sans text-[12.5px] leading-[18px] text-sage-400">{t('mover.exampleLabel')}</Text>

      {answer ? (
        <Answered answer={answer} place={stopName(pickup, dropoff)} onBack={() => setAnswer(null)} />
      ) : (
        <>
          <RouteSketch />
          <View className="flex-row gap-2">
            <Text className="flex-1 font-sans-semibold text-[14px] text-night-50">
              {routeLabel(pickup, dropoff, (city) => t('landing.quote.withinCity', { city }))}
            </Text>
            <Text className="font-sans text-[14px] text-sage-400">{quote ? formatNumber(quote.distanceKm, locale) : '—'} km</Text>
          </View>
          <Text className="-mt-1.5 font-sans text-[11.5px] text-sage-400">{t('landing.movers.phone.district')}</Text>
          <View className="flex-row flex-wrap gap-1.5">
            <Pill tone="dark" shape="tag">
              {t(`vehicles.${VEHICLE}.name`)}
            </Pill>
            <Pill tone="dark" shape="tag">
              {t(`landing.movers.phone.crew${CREW}`)}
            </Pill>
            {quote ? (
              <Pill tone="dark" shape="tag">
                {t(`landing.quote.${quote.scope}`)}
              </Pill>
            ) : null}
          </View>

          <View className="flex-row items-end justify-between gap-3 border-t border-night-600 pt-3">
            <View>
              <Text className="font-sans text-[11.5px] text-sage-400">{t('landing.movers.phone.payout')}</Text>
              <Display size={30} tone="dark" accent accessibilityRole="text">
                {money('payout')}
              </Display>
            </View>
            <Text className="text-right font-sans text-[11.5px] leading-[15px] text-sage-400">
              {t('landing.movers.phone.breakdown', { price: money('moverPrice'), pct })}
            </Text>
          </View>

          {/* Large (52 pt), like the job buttons in the design. */}
          <View className="flex-row gap-2.5">
            <Button
              testID="example-decline"
              variant="outline-dark"
              className="flex-1"
              title={t('landing.movers.phone.decline')}
              onPress={() => reply('declined')}
            />
            <Button
              testID="example-accept"
              variant="accent"
              className="flex-[1.4]"
              title={t('landing.movers.phone.accept')}
              onPress={() => reply('accepted')}
            />
          </View>
        </>
      )}
    </DarkPanel>
  );
}

/** After Accept / Decline: the website's texts, then the example starts over. */
function Answered({ answer, place, onBack }: { answer: Answer; place: string; onBack: () => void }) {
  const { t } = useTranslation();
  const accepted = answer === 'accepted';
  return (
    <>
      <View className="items-center gap-3.5 py-4">
        {accepted ? (
          <View className="size-[72px] items-center justify-center rounded-full bg-accent-500">
            <CheckIcon size={32} strokeWidth={2.5} color={colors.ink[900]} />
          </View>
        ) : null}
        <Display size={24} tone="dark" className="text-center">
          {accepted ? t('landing.movers.phone.acceptedTitle') : t('landing.movers.phone.declinedTitle')}
        </Display>
        <Text className="text-center font-sans text-[14px] leading-[20px] text-sage-400">
          {accepted ? t('landing.movers.phone.acceptedText', { place }) : t('landing.movers.phone.declinedText')}
        </Text>
      </View>
      <Button
        testID="example-back"
        variant="outline-dark"
        title={accepted ? t('landing.movers.phone.back') : t('landing.movers.phone.showAgain')}
        onPress={onBack}
      />
    </>
  );
}
