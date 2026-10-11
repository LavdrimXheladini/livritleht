import { router } from 'expo-router';

import { LoginScreen } from '@ranktrip/mobile';

export default function Login() {
  return (
    <LoginScreen
      role="customer"
      onCodeSent={(sent) => router.push({ pathname: '/verify', params: sent })}
    />
  );
}
