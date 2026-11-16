import { Redirect, useLocalSearchParams } from 'expo-router';

import { useSide } from '@movershub/mobile';

import { JobScreen } from '@/components/mover/job-screen';

/** One accepted job and its move day (design/DECISIONS.md #36). Only the mover side has jobs. */
export default function MoverJob() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { side } = useSide();
  if (side && side !== 'mover') return <Redirect href="/" />;
  return <JobScreen id={id} />;
}
