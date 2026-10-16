import { Redirect, useLocalSearchParams } from 'expo-router';

import { isLegalDoc } from '@movershub/i18n';

import { LegalScreen } from '@/components/legal-screen';

/** A legal page (/legal/privacy, /legal/terms, /legal/mover-terms, /legal/contact), signed in or out. */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  if (!doc || !isLegalDoc(doc)) return <Redirect href="/" />;
  return <LegalScreen doc={doc} />;
}
