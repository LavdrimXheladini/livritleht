import { LegalPage, legalMetadata } from '@/components/legal/legal-page';

/** The terms for customers (design/DECISIONS.md #33): the shared legal text, a draft for now. */
export function generateMetadata({ params }: PageProps<'/[lang]/terms'>) {
  return legalMetadata('terms', params);
}

export default function Page({ params }: PageProps<'/[lang]/terms'>) {
  return <LegalPage doc="terms" params={params} />;
}
