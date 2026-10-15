import '../global.css';

import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';

import {
  AuthProvider,
  initI18n,
  restoreBookingDraft,
  restoreLocale,
  restorePasswordOwed,
  useAppFonts,
  useAuth,
  useProfile,
} from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { supabase } from '@/lib/supabase';

initI18n();
void SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient();
// Phones have no window focus events: data that has gone stale (e.g. the side, after a switch on
// another device) is fetched again when the app comes back to the foreground.
if (Platform.OS !== 'web') AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider supabase={supabase}>
        <RootStack />
        <StatusBar style="dark" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootStack() {
  const { session, loading } = useAuth();
  const fontsReady = useAppFonts();
  const profile = useProfile();
  // On launch the splash stays until a signed-in person's role is known, so the right side opens at
  // once — but at most ~2 s: on a slow network the home screen shows its own spinner, then Retry.
  // Once launched it stays: after signing in, home shows its own spinner too.
  const [launched, setLaunched] = useState(false);
  const [waitedEnough, setWaitedEnough] = useState(false);
  // What this device remembers — the language chosen in the app, a password still owed, a move being
  // booked — before the first screen shows (no flash of another language, no home before the password).
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    void Promise.all([restoreLocale(), restorePasswordOwed(), restoreBookingDraft()]).finally(() => setLocaleReady(true));
    const timer = setTimeout(() => setWaitedEnough(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  if (!launched && localeReady && !loading && fontsReady && (session === null || !profile.isPending || waitedEnough)) {
    setLaunched(true);
  }

  useEffect(() => {
    if (launched) void SplashScreen.hideAsync();
  }, [launched]);

  // The browser version has no native splash: an empty page in the app's colour instead of blank.
  if (!launched) return Platform.OS === 'web' ? <View style={{ flex: 1, backgroundColor: colors.stone[100] }} /> : null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.stone[100] } }}>
      {/* Signed out, the app opens on sign in / create account (as a customer or a mover). */}
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      {/* Signed in: the customer or the mover side, by the role chosen after the first sign-in (switchable). */}
      <Stack.Protected guard={session !== null}>
        <Stack.Screen name="index" />
        {/* The mover's setup, step by step. */}
        <Stack.Screen name="mover/company" options={{ contentStyle: { backgroundColor: colors.night[900] } }} />
        <Stack.Screen name="mover/documents" options={{ contentStyle: { backgroundColor: colors.night[900] } }} />
        <Stack.Screen name="mover/vehicles" options={{ contentStyle: { backgroundColor: colors.night[900] } }} />
        <Stack.Screen name="mover/vehicle" options={{ contentStyle: { backgroundColor: colors.night[900] } }} />
        <Stack.Screen name="mover/rates" options={{ contentStyle: { backgroundColor: colors.night[900] } }} />
        <Stack.Screen name="mover/rate-card" options={{ contentStyle: { backgroundColor: colors.night[900] } }} />
        {/* The customer's booking, step by step. */}
        <Stack.Screen name="book/stops" />
        <Stack.Screen name="book/items" />
        <Stack.Screen name="book/when" />
        <Stack.Screen name="book/size" />
      </Stack.Protected>
    </Stack>
  );
}
