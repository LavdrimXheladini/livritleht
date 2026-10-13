import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/** Where the session is kept on the device (AsyncStorage; localStorage in the browser version). */
export const SESSION_STORAGE_KEY = 'movershub.auth';

let configured = true;

/**
 * False on a fresh copy without mobile/app/.env (README "Run it locally", step 3): the app still opens,
 * on its sign-in screen with a note saying so, but nothing can reach a database.
 */
export const isSupabaseConfigured = () => configured;

/**
 * Supabase client for the Expo apps. URL/key are passed in from the app because
 * EXPO_PUBLIC_* env vars are only inlined in app code.
 */
export function createSupabaseClient(url: string, key: string): SupabaseClient {
  configured = url !== '' && key !== '';
  if (!configured) {
    console.warn(
      'Supabase env missing: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/app/.env ' +
        '(README "Run it locally", step 3).',
    );
  }
  // Expo web pre-renders in Node, where AsyncStorage (backed by window.localStorage) doesn't exist.
  const isServer = typeof window === 'undefined';
  // Placeholders keep supabase-js from throwing on an unconfigured copy; its requests simply fail.
  const client = createClient(url || 'http://127.0.0.1:54321', key || 'not-configured', {
    auth: {
      ...(isServer ? {} : { storage: AsyncStorage, storageKey: SESSION_STORAGE_KEY }),
      autoRefreshToken: !isServer,
      persistSession: !isServer,
      detectSessionInUrl: false,
    },
  });

  // Only refresh tokens while the app is in the foreground.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
  }

  return client;
}
