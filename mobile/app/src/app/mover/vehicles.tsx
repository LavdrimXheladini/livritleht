import { Redirect } from 'expo-router';

import { useProfile } from '@movershub/mobile';

import { VehiclesScreen } from '@/components/mover/vehicles-screen';

/** The mover's vans. Only the mover side has them (the database refuses anyone else too). */
export default function MoverVehicles() {
  const profile = useProfile();
  if (profile.data && profile.data.role !== 'mover') return <Redirect href="/" />;
  return <VehiclesScreen />;
}
