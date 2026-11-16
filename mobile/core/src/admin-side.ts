import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { SelfSignupRole } from '@movershub/shared';

import { useProfile } from './profile';

/*
 * Which side of the app an admin looks at. Customers and movers are on the side of their role
 * (`public.choose_role`); an admin's role never changes, so the side they see is only kept on this
 * device. What an admin may do on either side is decided by the server.
 */
const KEY = 'movershub.adminSide';
let side: SelfSignupRole = 'customer';
const listeners = new Set<() => void>();

/** No device storage while Expo web pre-renders in Node. */
const hasStorage = () => typeof window !== 'undefined';

/** At launch: the side the admin was on when the app closed. */
export async function restoreAdminSide(): Promise<void> {
  if (!hasStorage()) return;
  try {
    side = (await AsyncStorage.getItem(KEY)) === 'mover' ? 'mover' : 'customer';
  } catch {
    side = 'customer';
  }
}

export function setAdminSide(next: SelfSignupRole): void {
  side = next;
  for (const listener of listeners) listener();
  if (hasStorage()) void AsyncStorage.setItem(KEY, next).catch(() => undefined);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const current = () => side;

/**
 * The side of the app the signed-in person is on: their role, or for an admin the side they chose
 * on this device. `side` is null while the role isn't known (or not chosen yet).
 */
export function useSide(): { side: SelfSignupRole | null; admin: boolean } {
  const profile = useProfile();
  const adminSide = useSyncExternalStore(subscribe, current, current);
  const role = profile.data?.role ?? null;
  return { side: role === 'admin' ? adminSide : role, admin: role === 'admin' };
}
