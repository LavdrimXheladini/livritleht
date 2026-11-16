import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Checkbox, ChevronRightIcon, Stepper, TextField, currentLocale, useAnnouncement } from '@movershub/mobile';
import {
  ITEM_CATALOGUE,
  ITEM_GROUPS,
  MAX_ITEM_QTY,
  OTHER_ITEMS_MAX,
  fittingClass,
  formatTenths,
  jobItems,
  loadTenthsM3,
  type BookingDraft,
  type ItemGroup,
  type ItemKey,
} from '@movershub/shared';

import { colors } from '@movershub/ui';

import { BookingFrame, type UpdateBooking } from './booking-frame';

/**
 * Step 2: what to move, from the item catalogue by category (each opens like a dropdown list), with "take apart and put back
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
  // One category open at a time, like a dropdown list: the first one to start with.
  const [open, setOpen] = useState<ItemGroup | null>('seating');
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
        <Category key={group} group={group} draft={draft} open={open === group} onToggle={() => setOpen(open === group ? null : group)}>
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
        </Category>
      ))}
      <Card variant="widget">
        <TextField
          testID="items-other"
          label={t('booking.items.otherLabel')}
          hint={t('booking.items.otherHint')}
          placeholder={t('booking.items.otherPlaceholder')}
          multiline
          maxLength={OTHER_ITEMS_MAX}
          value={draft.otherItems}
          onChangeText={(text) => update((d) => ({ ...d, otherItems: text }))}
        />
      </Card>
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

/** A category: its name and how many things are chosen in it; a tap opens its list. */
function Category({ group, draft, open, onToggle, children }: { group: ItemGroup; draft: BookingDraft; open: boolean; onToggle: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const keys: readonly ItemKey[] = ITEM_GROUPS[group];
  const chosen = keys.reduce((n, key) => n + (draft.items[key]?.qty ?? 0), 0);
  const name = t(`booking.items.groups.${group}`);
  return (
    <Card variant="widget" className="gap-2">
      <Pressable
        testID={`items-group-${group}`}
        accessibilityRole="button"
        accessibilityLabel={chosen > 0 ? `${name}, ${t('booking.items.chosen', { count: chosen })}` : name}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={onToggle}
        className="min-h-11 flex-row items-center gap-3 active:opacity-60"
      >
        <Text className="flex-1 font-sans-semibold text-base text-ink-900">{name}</Text>
        {chosen > 0 ? (
          <View className="min-w-7 items-center rounded-full bg-brand-500 px-2 py-0.5">
            <Text testID={`items-group-${group}-count`} className="font-sans-semibold text-[13px] text-stone-50">
              {chosen}
            </Text>
          </View>
        ) : null}
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <ChevronRightIcon size={18} color={colors.ink[600]} />
        </View>
      </Pressable>
      {open ? children : null}
    </Card>
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
