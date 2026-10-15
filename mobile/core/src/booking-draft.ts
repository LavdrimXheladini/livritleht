import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';

import { bookingDraftSchema, type BookingDraft } from '@movershub/shared';

/*
 * The move a customer is putting together (stops, items, day, crew, van size), until they choose a
 * mover. Kept on the device, so closing the app or reloading the browser version keeps it; tied to
 * the account that started it, and forgotten when anyone signs out (the addresses are personal data).
 */
const KEY = 'movershub.booking';
const savedSchema = z.object({ userId: z.string(), draft: bookingDraftSchema });
type Saved = z.infer<typeof savedSchema>;

let saved: Saved | null = null;
const listeners = new Set<() => void>();

/** No device storage while Expo web pre-renders in Node. */
const hasStorage = () => typeof window !== 'undefined';

function publish(next: Saved | null) {
  saved = next;
  for (const listener of listeners) listener();
  if (!hasStorage()) return;
  const write = next ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY);
  void write.catch(() => undefined);
}

/** At launch: the move put together before the app closed. Anything unreadable is dropped. */
export async function restoreBookingDraft(): Promise<void> {
  if (!hasStorage()) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = savedSchema.safeParse(raw ? JSON.parse(raw) : null);
    saved = parsed.success ? parsed.data : null;
  } catch {
    saved = null;
  }
}

/** A new move for `userId`, replacing any earlier one. */
export function startBooking(userId: string, draft: BookingDraft): void {
  publish({ userId, draft });
}

/** Changes `userId`'s move; nothing when they have none. */
export function updateBooking(userId: string, change: (draft: BookingDraft) => BookingDraft): void {
  if (saved?.userId !== userId) return;
  publish({ userId, draft: change(saved.draft) });
}

/** Signing out, or the move is done with. */
export function clearBookingDraft(): void {
  if (saved !== null) publish(null);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const current = () => saved;

/** `userId`'s move being put together, or null. */
export function useBookingDraft(userId: string | undefined): BookingDraft | null {
  const now = useSyncExternalStore(subscribe, current, current);
  return now !== null && now.userId === userId ? now.draft : null;
}
