import { Redirect } from 'expo-router';

import { useSide } from '@movershub/mobile';

import { CompanyScreen } from '@/components/mover/company-form';

/** The mover's "Your company" form. Only the mover side has one (the database refuses anyone else too). */
export default function MoverCompany() {
  const { side } = useSide();
  if (side && side !== 'mover') return <Redirect href="/" />;
  return <CompanyScreen />;
}
