import { Redirect } from 'expo-router';

import { useProfile } from '@movershub/mobile';

import { CompanyScreen } from '@/components/mover/company-form';

/** The mover's "Your company" form. Only the mover side has one (the database refuses anyone else too). */
export default function MoverCompany() {
  const profile = useProfile();
  if (profile.data && profile.data.role !== 'mover') return <Redirect href="/" />;
  return <CompanyScreen />;
}
