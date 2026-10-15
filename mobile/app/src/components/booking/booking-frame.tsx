import { Redirect, router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Display, ProgressBar, Screen, updateBooking, useAuth, useBookingDraft, useProfile } from '@movershub/mobile';
import { jobItems, moveDays, stopProblems, type BookingDraft } from '@movershub/shared';

// The customer's booking, one screen per step: where (stops), what (items), when (day, time, crew),
// the van size priced for this move, the mover, then the booking request checked on the server.
// Next: the card (Stripe), which books the move.

export const BOOKING_STEPS = ['/book/stops', '/book/items', '/book/when', '/book/size', '/book/movers', '/book/review'] as const;

/** Each step's name, for test ids (the browser version keeps earlier screens in the page). */
const STEP_NAMES = ['stops', 'items', 'when', 'size', 'movers', 'review'] as const;

export type UpdateBooking = (change: (draft: BookingDraft) => BookingDraft) => void;

/** The signed-in customer's move being put together (null: none), and a way to change it. */
export function useBooking(): { draft: BookingDraft | null; update: UpdateBooking } {
  const { session } = useAuth();
  const userId = session?.user.id;
  const draft = useBookingDraft(userId);
  const update: UpdateBooking = (change) => {
    if (userId) updateBooking(userId, change);
  };
  return { draft, update };
}

const samePlace = (d: BookingDraft) => d.pickup.place.lat === d.dropoff.place.lat && d.pickup.place.lon === d.dropoff.place.lon;

/**
 * The first step still missing something, else the last (the review): where Continue on home leads.
 * The van size always has an answer (the size that fits the items).
 */
export function firstOpenStep(draft: BookingDraft, today = new Date()): number {
  if (samePlace(draft) || stopProblems(draft.pickup).length || stopProblems(draft.dropoff).length) return 0;
  if (jobItems(draft.items).length === 0) return 1;
  if (draft.day === null || draft.hour === null || !moveDays(today).includes(draft.day)) return 2;
  if (draft.choice === null) return 4;
  return 5;
}

function goBack(step: number) {
  if (router.canGoBack()) router.back();
  else router.replace(step > 0 ? BOOKING_STEPS[step - 1]! : '/');
}

/**
 * One booking screen: Back, "Step 2 of 4" with a bar, the title and what it is for, then the step.
 * Customers only (the mover side doesn't book). Without a move being put together (e.g. signed out
 * in another tab) it goes home; opened before an earlier step is done, it goes to that step.
 */
export function BookingFrame({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  children: (draft: BookingDraft, update: UpdateBooking) => ReactNode;
}) {
  const { t } = useTranslation();
  const profile = useProfile();
  const { draft, update } = useBooking();
  if (profile.data?.role === 'mover' || !draft) return <Redirect href="/" />;
  const open = firstOpenStep(draft);
  if (open < step) return <Redirect href={BOOKING_STEPS[open]!} />;

  const position = t('booking.step', { n: step + 1, total: BOOKING_STEPS.length });
  return (
    <Screen>
      <View className="min-h-11 flex-row items-center justify-between">
        <Button
          testID={`${STEP_NAMES[step]}-back`}
          variant="link"
          className="-ml-2"
          title={`‹ ${t('common.back')}`}
          accessibilityLabel={t('common.back')}
          onPress={() => goBack(step)}
        />
        {/* The bar below says the same to screen readers. */}
        <Text aria-hidden className="font-sans text-[13px] text-ink-600">
          {position}
        </Text>
      </View>
      <ProgressBar value={(step + 1) / BOOKING_STEPS.length} label={position} track="light" />
      <View className="gap-2">
        <Display>{title}</Display>
        <Text className="font-sans text-[15px] leading-[22px] text-ink-600">{subtitle}</Text>
      </View>
      {children(draft, update)}
    </Screen>
  );
}
