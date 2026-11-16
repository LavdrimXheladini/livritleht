import { Redirect } from 'expo-router';

import { useSide } from '@movershub/mobile';

import { VehiclesScreen } from '@/components/mover/vehicles-screen';

/** The mover's vans. Only the mover side has them (the database refuses anyone else too). */
export default function MoverVehicles() {
  const { side } = useSide();
  if (side && side !== 'mover') return <Redirect href="/" />;
  return <VehiclesScreen />;
}
