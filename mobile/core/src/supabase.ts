import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/** Where the session is kept on the device (AsyncStorage; localStorage in the browser version). */
export const SESSION_STORAGE_KEY = 'movershub.auth';

/**
 * Supabase client for the Expo apps. URL/key are passed in from the app because
 * EXPO_PUBLIC_* env vars are only inlined in app code.
 */
export function createSupabaseClient(url: string, key: string): SupabaseClient {
  if (!url || !key) {
    console.warn('Supabase env missing: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  // Expo web pre-renders in Node, where AsyncStorage (backed by window.localStorage) doesn't exist.
  const isServer = typeof window === 'undefined';
  const client = createClient(url, key, {
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
