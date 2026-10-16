import { Redirect, useLocalSearchParams } from 'expo-router';

import { isLegalDoc } from '@movershub/i18n';

import { LegalScreen } from '@/components/legal-screen';

/** A legal page (/legal/privacy, /legal/terms, /legal/mover-terms, /legal/contact), signed in or out; ?version=… a published version of the terms. */
export default function Legal() {
  // `version`: a published version of the terms (the text people accept), else the text in the app.
  const { doc, version } = useLocalSearchParams<{ doc: string; version?: string }>();
  if (!doc || !isLegalDoc(doc)) return <Redirect href="/" />;
  return <LegalScreen doc={doc} version={version} />;
}
