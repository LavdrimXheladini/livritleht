import { Redirect, useLocalSearchParams } from 'expo-router';

import { useSide } from '@movershub/mobile';

import { RateCardScreen } from '@/components/mover/rates-screen';

/** One van's prices, `?vehicle=<id>`. */
export default function MoverRateCard() {
  const { side } = useSide();
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>();
  if (side && side !== 'mover') return <Redirect href="/" />;
  return <RateCardScreen key={vehicle ?? 'none'} vehicleId={vehicle} />;
}
