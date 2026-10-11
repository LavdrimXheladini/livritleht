import { router } from 'expo-router';

import { LoginScreen } from '@ranktrip/mobile';

export default function Login() {
  return (
    <LoginScreen
      role="mover"
      onCodeSent={(sent) => router.push({ pathname: '/verify', params: sent })}
    />
  );
}
