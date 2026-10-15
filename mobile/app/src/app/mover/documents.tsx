import { Redirect } from 'expo-router';

import { useProfile } from '@movershub/mobile';

import { DocumentsScreen } from '@/components/mover/documents-screen';

/** The mover's documents. Only the mover side has them (the database and storage refuse anyone else too). */
export default function MoverDocuments() {
  const profile = useProfile();
  if (profile.data && profile.data.role !== 'mover') return <Redirect href="/" />;
  return <DocumentsScreen />;
}
