import { Redirect, useLocalSearchParams } from 'expo-router';

import { useProfile } from '@movershub/mobile';

import { VehicleFormScreen } from '@/components/mover/vehicles-screen';

/** Add a van, or change the one in `?id=` (the id only — nothing personal goes into the address). */
export default function MoverVehicle() {
  const profile = useProfile();
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (profile.data && profile.data.role !== 'mover') return <Redirect href="/" />;
  return <VehicleFormScreen key={id ?? 'new'} vehicleId={id} />;
}
