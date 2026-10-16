import { LegalPage, legalMetadata } from '@/components/legal/legal-page';

/** Contact and legal notice (design/DECISIONS.md #33): the shared legal text, a draft for now. */
export function generateMetadata({ params }: PageProps<'/[lang]/contact'>) {
  return legalMetadata('contact', params);
}

export default function Page({ params }: PageProps<'/[lang]/contact'>) {
  return <LegalPage doc="contact" params={params} />;
}
