import { Redirect } from 'expo-router';

import { useSide } from '@movershub/mobile';

import { AppealsScreen } from '@/components/mover/appeals-screen';

/** The mover's appeals and complaints. Only the mover side has them (the database refuses anyone else too). */
export default function MoverAppeals() {
  const { side } = useSide();
  if (side && side !== 'mover') return <Redirect href="/" />;
  return <AppealsScreen />;
}
