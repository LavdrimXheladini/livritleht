import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, Checkbox, Stepper, currentLocale, useAnnouncement } from '@movershub/mobile';
import {
  ITEM_CATALOGUE,
  ITEM_GROUPS,
  MAX_ITEM_QTY,
  fittingClass,
  formatTenths,
  jobItems,
  loadTenthsM3,
  type BookingDraft,
  type ItemGroup,
  type ItemKey,
} from '@movershub/shared';

import { BookingFrame, type UpdateBooking } from './booking-frame';

/**
 * Step 2: what to move, from the item catalogue (sofas, beds, boxes…), with "take apart and put back
 * together" where an item comes apart. Each mover prices this list with their own rates; the volume
 * only suggests a van size that fits.
 */
export function ItemsScreen() {
  const { t } = useTranslation();
  return (
    <BookingFrame step={1} title={t('booking.items.title')} subtitle={t('booking.items.subtitle')}>
      {(draft, update) => <Items draft={draft} update={update} />}
    </BookingFrame>
  );
}

function Items({ draft, update }: { draft: BookingDraft; update: UpdateBooking }) {
  const { t } = useTranslation();
  const [tried, setTried] = useState(0);
  const listed = jobItems(draft.items);
  const missing = tried > 0 && listed.length === 0;
  useAnnouncement(missing ? t('booking.items.none') : null, tried);

  const setQty = (key: ItemKey, qty: number) =>
    update((d) => {
      const items = { ...d.items };
      if (qty <= 0) delete items[key];
      else items[key] = { qty, assembly: items[key]?.assembly ?? false };
      return { ...d, items };
    });
  const setAssembly = (key: ItemKey, assembly: boolean) =>
    update((d) => {
      const item = d.items[key];
      return item ? { ...d, items: { ...d.items, [key]: { ...item, assembly } } } : d;
    });

  const next = () => {
    if (listed.length === 0) {
      setTried((n) => n + 1);
      return;
    }
    // The size that fits is where the van choice starts (the home's choice was for a typical load).
    update((d) => ({ ...d, vehicleClass: fittingClass(loadTenthsM3(jobItems(d.items))) }));
    router.push('/book/when');
  };

  return (
    <>
      {(Object.keys(ITEM_GROUPS) as ItemGroup[]).map((group) => (
        <Card key={group} variant="widget" className="gap-2">
          <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
            {t(`booking.items.groups.${group}`)}
          </Text>
          {ITEM_GROUPS[group].map((key) => (
            <ItemRow
              key={key}
              itemKey={key}
              qty={draft.items[key]?.qty ?? 0}
              assembly={draft.items[key]?.assembly ?? false}
              onQty={(q) => setQty(key, q)}
              onAssembly={(a) => setAssembly(key, a)}
            />
          ))}
        </Card>
      ))}
      <LoadSummary draft={draft} />
      {missing ? (
        <Text testID="items-none" className="font-sans text-[13px] text-danger">
          {t('booking.items.none')}
        </Text>
      ) : null}
      <Button testID="items-next" title={t('common.continue')} onPress={next} />
    </>
  );
}

function ItemRow({
  itemKey,
  qty,
  assembly,
  onQty,
  onAssembly,
}: {
  itemKey: ItemKey;
  qty: number;
  assembly: boolean;
  onQty: (qty: number) => void;
  onAssembly: (assembly: boolean) => void;
}) {
  const { t } = useTranslation();
  const name = t(`items.${itemKey}`);
  return (
    <View className="gap-1 py-1">
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 font-sans text-[15px] text-ink-900">{name}</Text>
        <Stepper
          testID={`item-${itemKey}`}
          value={qty}
          min={0}
          max={MAX_ITEM_QTY}
          label={name}
          decreaseLabel={t('booking.items.fewer')}
          increaseLabel={t('booking.items.more')}
          onChange={onQty}
        />
      </View>
      {qty > 0 && ITEM_CATALOGUE[itemKey].assemblable ? (
        <Checkbox
          testID={`item-${itemKey}-assembly`}
          checked={assembly}
          onChange={onAssembly}
          label={t('booking.items.assembly')}
          accessibilityLabel={`${name}: ${t('booking.items.assembly')}`}
        />
      ) : null}
    </View>
  );
}

/** "About 9.4 m³ · Fits in: Large van or bigger" — the catalogue's estimate, never a price. */
export function LoadSummary({ draft }: { draft: BookingDraft }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const tenths = loadTenthsM3(jobItems(draft.items));
  if (tenths === 0) return null;
  const fit = fittingClass(tenths);
  const vehicle = t(`vehicles.${fit}.name`);
  return (
    <Card variant="inset" className="gap-1">
      <Text testID="items-load" accessibilityLiveRegion="polite" className="font-sans-semibold text-[15px] text-ink-900">
        {t('booking.items.load', { m3: formatTenths(tenths, locale) })}
      </Text>
      <Text testID="items-fits" className="font-sans text-sm text-ink-700">
        {fit === 'TRUCK' ? t('booking.items.fitsTruck', { vehicle }) : t('booking.items.fits', { vehicle })}
      </Text>
    </Card>
  );
}
