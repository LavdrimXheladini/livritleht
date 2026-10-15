import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { VehicleClassTile } from '@movershub/mobile';
import { VEHICLE_CLASSES, VEHICLE_CLASS_INFO, formatNumber, type Locale, type VehicleClass } from '@movershub/shared';

import { priceText, type ClassOffers } from './offers';

/**
 * The five vehicle classes as one choice, each with its lowest mover's price ("from") and the
 * number of offers. A class no mover offers here is shown but can't be picked.
 */
export function VehicleClasses({
  offers,
  selected,
  onSelect,
  locale,
  updating,
  testIDPrefix = 'class',
}: {
  offers: ClassOffers;
  selected: VehicleClass;
  onSelect: (cls: VehicleClass) => void;
  locale: Locale;
  /** The prices are still the last route's (a screen reader says "busy"). */
  updating: boolean;
  /** Tiles get `${testIDPrefix}-${class}` (the browser version keeps the home in the page under the booking). */
  testIDPrefix?: string;
}) {
  const { t } = useTranslation();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('landing.quote.classes')} className="gap-2">
      {VEHICLE_CLASSES.map((k) => {
        const offer = offers[k];
        return (
          <VehicleClassTile
            key={k}
            testID={`${testIDPrefix}-${k}`}
            name={t(`vehicles.${k}.name`)}
            capacity={VEHICLE_CLASS_INFO[k].capacity}
            fits={t(`vehicles.${k}.fits`)}
            pricePrefix={t('landing.quote.from')}
            priceLabel={offer ? priceText(offer, locale) : undefined}
            offersLabel={offer ? t('landing.quote.offers', { n: formatNumber(offer.offers, locale) }) : undefined}
            unavailable={t('landing.quote.noMovers')}
            selected={k === selected}
            busy={updating}
            onPress={() => onSelect(k)}
          />
        );
      })}
    </View>
  );
}
