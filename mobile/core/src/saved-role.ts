import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { USER_ROLES, type UserRole } from '@movershub/shared';

// The side (role) last shown on this device, so the app opens on it without waiting for the network:
// shown at once on launch while the server is asked, and kept when the server can't be reached.
// Only a convenience — the server's answer replaces it, and what anyone may do is enforced there.
const KEY = 'movershub.role';
const savedSchema = z.object({ userId: z.string(), role: z.enum(USER_ROLES) });

/** No device storage while Expo web pre-renders in Node. */
const hasStorage = () => typeof window !== 'undefined';

/** The role saved for this person on this device, or null. */
export async function readSavedRole(userId: string): Promise<UserRole | null> {
  if (!hasStorage()) return null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = savedSchema.safeParse(raw ? JSON.parse(raw) : null);
    return saved.success && saved.data.userId === userId ? saved.data.role : null;
  } catch {
    return null;
  }
}

/** Remembers the role the server confirmed (null: nothing to remember). */
export function saveRole(userId: string, role: UserRole | null): void {
  if (!hasStorage()) return;
  const write = role === null ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, JSON.stringify({ userId, role }));
  // A failed write only means the next launch waits for the server.
  write.catch(() => undefined);
}

/** On sign-out: the next person on this device starts from the server. */
export function forgetSavedRole(): void {
  if (hasStorage()) AsyncStorage.removeItem(KEY).catch(() => undefined);
}
