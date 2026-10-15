import { Redirect, useLocalSearchParams } from 'expo-router';

import { useProfile } from '@movershub/mobile';

import { RateCardScreen } from '@/components/mover/rates-screen';

/** One van's prices, `?vehicle=<id>`. */
export default function MoverRateCard() {
  const profile = useProfile();
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>();
  if (profile.data && profile.data.role !== 'mover') return <Redirect href="/" />;
  return <RateCardScreen key={vehicle ?? 'none'} vehicleId={vehicle} />;
}
