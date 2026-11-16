import { Redirect, useLocalSearchParams } from 'expo-router';

import { useSide } from '@movershub/mobile';

import { VehicleFormScreen } from '@/components/mover/vehicles-screen';

/** Add a van, or change the one in `?id=` (the id only — nothing personal goes into the address). */
export default function MoverVehicle() {
  const { side } = useSide();
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (side && side !== 'mover') return <Redirect href="/" />;
  return <VehicleFormScreen key={id ?? 'new'} vehicleId={id} />;
}
