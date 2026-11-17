import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { MoverJobRow } from '@movershub/shared';
import { BuildingIcon, DarkPanel, Display, DocumentIcon, TagIcon, VanIcon } from '@movershub/mobile';

import { IconRow } from './icon-row';
import { MoverJobsList } from './job-requests';

/** A day from now at `hour` o'clock, so the sample always looks current. */
function inDays(days: number, hour: number): string {
  const at = new Date();
  at.setDate(at.getDate() + days);
  at.setHours(hour, 0, 0, 0);
  return at.toISOString();
}

/** A sample move as `public.my_mover_jobs` answers it. The ids are made up: nothing here reaches the server. */
function sampleRow(n: number, changes: Partial<MoverJobRow>): MoverJobRow {
  return {
    offer_id: `00000000-0000-4000-8000-00000005a0f${n}`,
    offer_status: 'accepted',
    offer_expires_at: inDays(1, 20),
    job_id: `00000000-0000-4000-8000-00000005a0e${n}`,
    status: 'ACCEPTED',
    type: 'SMALL_MOVE',
    vehicle_class: 'VAN',
    helpers: 2,
    scheduled_at: inDays(3, 9),
    items: [
      { key: 'sofa3', qty: 1, assembly: false },
      { key: 'box', qty: 10, assembly: false },
    ],
    distance_km: 83.2,
    est_labor_min: 75,
    pickup_area: 'Prishtina',
    pickup_district: 'Dardania',
    pickup_country: 'XK',
    pickup_floor: 3,
    pickup_has_lift: false,
    dropoff_area: 'Prizren',
    dropoff_district: null,
    dropoff_country: 'XK',
    dropoff_floor: 0,
    dropoff_has_lift: false,
    currency: 'EUR',
    line_items: [{ kind: 'base', amount: 7942 }],
    mover_price: 7942,
    take_rate_pct: 20,
    platform_commission: 1588,
    mover_payout: 6354,
    cancel_free_hours: 48,
    cancel_late_pct: 50,
    pickup_label: null,
    pickup_street: null,
    pickup_house_number: null,
    pickup_details: null,
    pickup_lat: null,
    pickup_lon: null,
    dropoff_label: null,
    dropoff_street: null,
    dropoff_house_number: null,
    dropoff_details: null,
    dropoff_lat: null,
    dropoff_lon: null,
    on_my_way_from: null,
    last_event_at: null,
    ended_at: null,
    cancelled_by: null,
    cancel_reason: null,
    cancellation_fee: null,
    fee_rule: null,
    confirmed_at: null,
    absent_reason_from: null,
    contact_phone: null,
    contact_name: null,
    items_note: null,
    helpers_asked: null,
    ...changes,
  };
}

const STEPS = [
  ['company', BuildingIcon],
  ['documents', DocumentIcon],
  ['vehicles', VanIcon],
  ['rates', TagIcon],
] as const;

/**
 * What a set-up mover's home looks like, with sample data — for admins, who have no company of their
 * own (the role is MoversHub's, not a mover's). Look only: it takes no touches, and nothing in it
 * comes from or goes to the server.
 */
export function SampleDashboard() {
  const { t } = useTranslation();
  const rows = [
    // A move under way, a request waiting for an answer, and a move accepted for later.
    sampleRow(1, { status: 'AT_PICKUP', scheduled_at: inDays(0, 9), last_event_at: inDays(0, 9) }),
    sampleRow(2, { offer_status: 'offered', status: 'OFFERED', pickup_area: 'Ferizaj', pickup_district: null, dropoff_area: 'Prishtina', vehicle_class: 'LARGE_VAN', scheduled_at: inDays(5, 10) }),
    sampleRow(3, {
      pickup_area: 'Prizren',
      pickup_district: null,
      pickup_label: 'Rruga e Shadërvanit 10, Prizren',
      dropoff_area: 'Gjakova',
      dropoff_label: 'Rruga Ismail Qemali 4, Gjakova',
      scheduled_at: inDays(8, 8),
    }),
  ];
  return (
    <View testID="sample-dashboard" className="gap-5">
      <DarkPanel variant="tile">
        <Text testID="sample-note" className="font-sans text-[13.5px] leading-5 text-accent-300">
          {t('mover.sample.note')}
        </Text>
      </DarkPanel>
      <View aria-hidden pointerEvents="none" className="gap-5">
        <MoverJobsList rows={rows} />
        <DarkPanel className="gap-4">
          <Display size={22} tone="dark">
            {t('mover.checklistTitle')}
          </Display>
          <View className="gap-4">
            {STEPS.map(([key, icon]) => (
              <IconRow
                key={key}
                icon={icon}
                title={t(`mover.steps.${key}.title`)}
                text={t(`mover.steps.${key}.text`)}
                badge={t('mover.stepStatus.verified')}
                badgeTone="dark"
              />
            ))}
          </View>
        </DarkPanel>
      </View>
    </View>
  );
}
