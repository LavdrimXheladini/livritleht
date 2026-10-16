import { LegalPage, legalMetadata } from '@/components/legal/legal-page';

/** The privacy policy (design/DECISIONS.md #33): the shared legal text, a draft for now. */
export function generateMetadata({ params }: PageProps<'/[lang]/privacy'>) {
  return legalMetadata('privacy', params);
}

export default function Page({ params }: PageProps<'/[lang]/privacy'>) {
  return <LegalPage doc="privacy" params={params} />;
}
