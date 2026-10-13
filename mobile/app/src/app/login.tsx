import { router } from 'expo-router';

import { AuthScreen, setPendingSignIn } from '@movershub/mobile';

export default function Login() {
  return (
    <AuthScreen
      onCodeSent={(sent) => {
        // In memory, not in the URL: the address must not land in history or logs (COMPLIANCE §9).
        setPendingSignIn(sent);
        router.push('/verify');
      }}
    />
  );
}
