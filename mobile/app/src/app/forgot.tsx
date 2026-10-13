import { router } from 'expo-router';

import { ForgotPasswordScreen, setPendingSignIn } from '@movershub/mobile';

export default function Forgot() {
  return (
    <ForgotPasswordScreen
      onCodeSent={(sent) => {
        // In memory, not in the URL: the address must not land in history or logs (COMPLIANCE §9).
        setPendingSignIn(sent);
        router.push('/verify');
      }}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
    />
  );
}
