import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { AuthScreen, getDraftVersion, setPendingSignIn } from '@movershub/mobile';

export default function Login() {
  // Back from "Forgot password?" with a corrected address: the form starts again with it. (Coming back
  // from the code screen keeps the form as it was, with the tab and the side picked.)
  const [draft, setDraft] = useState(getDraftVersion);
  useFocusEffect(useCallback(() => setDraft(getDraftVersion()), []));

  return (
    <AuthScreen
      key={draft}
      onCodeSent={(sent) => {
        // In memory, not in the URL: the address must not land in history or logs (COMPLIANCE §9).
        setPendingSignIn(sent);
        router.push('/verify');
      }}
      onForgotPassword={() => router.push('/forgot')}
    />
  );
}
