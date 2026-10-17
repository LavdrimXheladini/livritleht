import { Redirect, useLocalSearchParams } from 'expo-router';

import { useProfile } from '@movershub/mobile';

import { JobScreen } from '@/components/mover/job-screen';

/** One accepted job and its move day (design/DECISIONS.md #36). Only the mover side has jobs. */
export default function MoverJob() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const profile = useProfile();
  if (profile.data && profile.data.role !== 'mover') return <Redirect href="/" />;
  return <JobScreen id={id} />;
}
