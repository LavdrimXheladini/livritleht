import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, initI18n, useAppFonts, useAuth } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { supabase } from '@/lib/supabase';

initI18n();
void SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient();

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
  const ready = !loading && fontsReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.stone[100] } }}>
      {/* Prices are public, like on the website; signing in is needed only to book. */}
      <Stack.Screen name="index" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
    </Stack>
  );
}
