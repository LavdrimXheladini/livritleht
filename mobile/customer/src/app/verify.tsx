import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { VerifyScreen } from '@ranktrip/mobile';

export default function Verify() {
  const { channel, target } = useLocalSearchParams<{ channel: string; target: string }>();
  if ((channel !== 'phone' && channel !== 'email') || !target) return <Redirect href="/login" />;

  return <VerifyScreen sent={{ channel, target }} onBack={() => router.back()} />;
}
