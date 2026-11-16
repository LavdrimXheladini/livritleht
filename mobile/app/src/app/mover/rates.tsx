import { Redirect } from 'expo-router';

import { useSide } from '@movershub/mobile';

import { RatesScreen } from '@/components/mover/rates-screen';

/** The mover's prices per van and work area. Only the mover side has them (the database refuses anyone else too). */
export default function MoverRates() {
  const { side } = useSide();
  if (side && side !== 'mover') return <Redirect href="/" />;
  return <RatesScreen />;
}
