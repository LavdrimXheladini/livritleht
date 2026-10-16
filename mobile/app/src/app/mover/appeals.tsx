import { Redirect } from 'expo-router';

import { useProfile } from '@movershub/mobile';

import { AppealsScreen } from '@/components/mover/appeals-screen';

/** The mover's appeals and complaints. Only the mover side has them (the database refuses anyone else too). */
export default function MoverAppeals() {
  const profile = useProfile();
  if (profile.data && profile.data.role !== 'mover') return <Redirect href="/" />;
  return <AppealsScreen />;
}
