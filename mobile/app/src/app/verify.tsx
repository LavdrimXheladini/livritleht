import { Redirect, router } from 'expo-router';

import { VerifyScreen, getPendingSignIn } from '@movershub/mobile';

export default function Verify() {
  // Nothing pending (e.g. the browser version was reloaded here): start again from sign in.
  const sent = getPendingSignIn();
  if (!sent) return <Redirect href="/login" />;

  return <VerifyScreen sent={sent} onBack={() => (router.canGoBack() ? router.back() : router.replace('/login'))} />;
}
