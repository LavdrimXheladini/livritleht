import { LegalPage, legalMetadata } from '@/components/legal/legal-page';

/** The terms for movers (design/DECISIONS.md #33): the shared legal text, a draft for now. */
export function generateMetadata({ params }: PageProps<'/[lang]/mover-terms'>) {
  return legalMetadata('mover-terms', params);
}

export default function Page({ params }: PageProps<'/[lang]/mover-terms'>) {
  return <LegalPage doc="mover-terms" params={params} />;
}
