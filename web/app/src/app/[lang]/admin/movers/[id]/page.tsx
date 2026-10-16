import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { isLocale, type Locale } from '@movershub/i18n';
import { decisionState } from '@movershub/shared';

import { getAdminT, getT } from '@/lib/i18n';

import { AdminFrame, AdminGate } from '../../admin-frame';
import type { AdminSupabase } from '../../admin-session';
import { AnswerForm, LiftForm, SuspendForm } from '../../decision-forms';
import { ReviewButtons } from '../../review-buttons';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The registers to check by hand where there is no API (design/DECISIONS.md #19). */
const MANUAL_REGISTERS: Record<string, { name: string; url: string }> = {
  XK: { name: 'ARBK', url: 'https://arbk.rks-gov.net' },
  AL: { name: 'QKB', url: 'https://qkb.gov.al' },
  MK: { name: 'CRM', url: 'https://www.crm.com.mk' },
};

/**
 * One mover: company, registers, documents, vans, prices and areas, decisions and their history. The
 * mover's id is known only per request (Cache Components): everything renders inside the Suspense.
 */
export default function AdminMoverPage({ params }: PageProps<'/[lang]/admin/movers/[id]'>) {
  return (
    <Suspense fallback={null}>
      <AdminMover params={params} />
    </Suspense>
  );
}

async function AdminMover({ params }: { params: PageProps<'/[lang]/admin/movers/[id]'>['params'] }) {
  const { lang, id } = await params;
  if (!isLocale(lang) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = getT(lang);
  const ta = getAdminT(lang);
  return (
    <AdminFrame locale={lang} title={ta('moverTitle')}>
      <Suspense fallback={<p className="text-ink-500">{t('common.loading')}</p>}>
        <AdminGate locale={lang}>{(supabase) => <MoverDetails locale={lang} id={id} supabase={supabase} />}</AdminGate>
      </Suspense>
    </AdminFrame>
  );
}

type Company = {
  id: string;
  owner_id: string;
  legal_name: string;
  is_business: boolean;
  registration_no: string | null;
  tax_id: string | null;
  country: string;
  tax_residency_country: string | null;
  address: string | null;
  address_details: { lat?: number; lon?: number } | null;
  contact_phone: string | null;
  contact_email: string | null;
  self_certification_at: string | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  review_note: string | null;
  updated_at: string;
};
type Document = { id: string; type: string; file_path: string; expires_at: string | null; verified_at: string | null; review_note: string | null };
type Van = {
  id: string;
  class: string;
  plate: string;
  max_weight_kg: number | null;
  volume_m3: number | null;
  has_tail_lift: boolean;
  tachograph: boolean;
  active: boolean;
  verified_at: string | null;
  review_note: string | null;
};
type RegistryCheck = { register: string; result: string; tax_id: string; registered_name: string | null; registered_address: string | null; checked_at: string };
type Entry = { action: string; entity: string; note: string | null; created_at: string };
type Appeal = { id: string; suspension_id: string | null; subject: string; text: string; status: string; decision_reason: string | null; created_at: string; resolved_at: string | null };
type Decision = {
  id: string;
  kind: 'restriction' | 'suspension' | 'termination';
  flagged_by: string;
  reason_text: string;
  is_serious_violation: boolean;
  notice_sent_at: string | null;
  effective_at: string | null;
  lifted_at: string | null;
  created_at: string;
  mover_appeals: Appeal[];
};
const APPEAL = 'id, suspension_id, subject, text, status, decision_reason, created_at, resolved_at';
const waiting = (a: Appeal) => a.status === 'open' || a.status === 'under_review';

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

async function MoverDetails({ locale, id, supabase }: { locale: Locale; id: string; supabase: AdminSupabase }) {
  const t = getT(locale);
  const ta = getAdminT(locale);
  const { data: companyData } = await supabase
    .from('mover_companies')
    .select(
      'id, owner_id, legal_name, is_business, registration_no, tax_id, country, tax_residency_country, address, address_details, contact_phone, contact_email, self_certification_at, verification_status, review_note, updated_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (!companyData) return <p className="text-ink-700">{ta('notFound')}</p>;
  const company = companyData as Company;

  const [documents, vans, checks, phones, cards, areas, suspensions, complaintRows] = await Promise.all([
    supabase.from('mover_documents').select('id, type, file_path, expires_at, verified_at, review_note').eq('company_id', id),
    supabase.from('vehicles').select('id, class, plate, max_weight_kg, volume_m3, has_tail_lift, tachograph, active, verified_at, review_note').eq('company_id', id).order('created_at'),
    supabase.from('company_registry_checks').select('register, result, tax_id, registered_name, registered_address, checked_at').eq('user_id', company.owner_id).order('checked_at', { ascending: false }).limit(5),
    supabase.from('phone_verifications').select('phone').eq('user_id', company.owner_id),
    supabase.from('rate_cards').select('vehicle_id, currency, confirmed_by_mover_at, vehicles!inner(company_id)').eq('vehicles.company_id', id),
    supabase.from('service_areas').select('label, radius_km').eq('company_id', id),
    supabase
      .from('suspensions')
      .select(`id, kind, flagged_by, reason_text, is_serious_violation, notice_sent_at, effective_at, lifted_at, created_at, mover_appeals(${APPEAL})`)
      .eq('company_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('mover_appeals').select(APPEAL).eq('company_id', id).is('suspension_id', null).order('created_at', { ascending: false }),
  ]);
  const decisions = (suspensions.data ?? []) as Decision[];
  const complaints = (complaintRows.data ?? []) as Appeal[];
  const docs = (documents.data ?? []) as Document[];
  const vehicles = (vans.data ?? []) as Van[];
  const ids = [
    company.id,
    ...docs.map((d) => d.id),
    ...vehicles.map((v) => v.id),
    ...decisions.flatMap((d) => [d.id, ...d.mover_appeals.map((a) => a.id)]),
    ...complaints.map((c) => c.id),
  ];
  const { data: history } = await supabase.from('audit_log').select('action, entity, note, created_at').in('entity_id', ids).order('created_at', { ascending: false }).limit(30);
  // Links to the private files, valid for 10 minutes (the admin's session may read them).
  const links = new Map<string, string>();
  await Promise.all(
    docs.map(async (d) => {
      const { data } = await supabase.storage.from('mover-documents').createSignedUrl(d.file_path, 600);
      if (data?.signedUrl) links.set(d.id, data.signedUrl);
    }),
  );
  const phoneConfirmed = (phones.data ?? []).some((p) => p.phone === company.contact_phone);
  const manual = MANUAL_REGISTERS[company.country];
  const point = company.address_details;

  return (
    <div className="flex flex-col gap-6">
      <Section title={company.legal_name} aside={<Status value={company.verification_status} ta={ta} />}>
        <Facts
          rows={[
            [ta('kind'), company.is_business ? ta('business') : ta('person')],
            [ta('registrationNo'), company.registration_no ?? '—'],
            [ta('taxId'), company.tax_id ?? '—'],
            [ta('country'), `${company.country} · ${ta('taxCountry')}: ${company.tax_residency_country ?? '—'}`],
            [
              ta('address'),
              point?.lat !== undefined && point.lon !== undefined ? (
                <a className="underline" href={`https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=18/${point.lat}/${point.lon}`} target="_blank" rel="noreferrer">
                  {company.address}
                </a>
              ) : (
                (company.address ?? '—')
              ),
            ],
            [ta('phone'), `${company.contact_phone ?? '—'} · ${phoneConfirmed ? ta('phoneConfirmed') : ta('phoneNotConfirmed')}`],
            [ta('email'), company.contact_email ?? '—'],
            [ta('selfCertified'), day(company.self_certification_at)],
            [ta('updatedAt'), day(company.updated_at)],
          ]}
        />
        {company.review_note ? <Note text={company.review_note} ta={ta} /> : null}
        {company.verification_status === 'pending' ? (
          <ReviewButtons lang={locale} kind="company" id={company.id} companyId={company.id} testId="review-company" />
        ) : null}
      </Section>

      <Section title={ta('registers')}>
        {(checks.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-600">
            {manual ? (
              <>
                {ta('checkByHand', { register: manual.name })}{' '}
                <a className="underline" href={manual.url} target="_blank" rel="noreferrer">
                  {manual.url}
                </a>
              </>
            ) : (
              ta('noRegisterAnswer')
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {((checks.data ?? []) as RegistryCheck[]).map((c) => (
              <li key={c.checked_at} className="text-ink-700">
                <strong className="text-ink-900">{ta(`registerResult.${c.result}`, { defaultValue: c.result })}</strong> · {c.register} · {c.tax_id}
                {c.registered_name ? ` · ${c.registered_name}` : ''}
                {c.registered_address ? ` · ${c.registered_address}` : ''} · {day(c.checked_at)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={ta('documents')}>
        {docs.length === 0 ? <p className="text-sm text-ink-600">{ta('none')}</p> : null}
        {docs.map((d) => (
          <Item
            key={d.id}
            title={t(`mover.documents.types.${d.type as 'id'}.title`)}
            aside={<Status value={d.verified_at ? 'verified' : d.review_note ? 'rejected' : 'pending'} ta={ta} />}
          >
            <p className="text-sm text-ink-700">
              {ta('validUntil')}: {day(d.expires_at)}
              {links.get(d.id) ? (
                <>
                  {' · '}
                  <a className="underline" href={links.get(d.id)} target="_blank" rel="noreferrer" data-testid={`admin-file-${d.type}`}>
                    {ta('openFile')}
                  </a>
                </>
              ) : null}
            </p>
            {d.review_note ? <Note text={d.review_note} ta={ta} /> : null}
            {!d.verified_at ? <ReviewButtons lang={locale} kind="document" id={d.id} companyId={company.id} testId={`review-document-${d.type}`} /> : null}
          </Item>
        ))}
      </Section>

      <Section title={ta('vans')}>
        {vehicles.length === 0 ? <p className="text-sm text-ink-600">{ta('none')}</p> : null}
        {vehicles.map((v) => (
          <Item
            key={v.id}
            title={`${t(`vehicles.${v.class as 'VAN'}.name`)} · ${v.plate}`}
            aside={<Status value={!v.active ? 'inactive' : v.verified_at ? 'verified' : v.review_note ? 'rejected' : 'pending'} ta={ta} />}
          >
            <p className="text-sm text-ink-700">
              {v.max_weight_kg ?? '—'} kg · {v.volume_m3 ?? '—'} m³ · {v.has_tail_lift ? ta('tailLift') : ta('noTailLift')} ·{' '}
              {v.tachograph ? ta('tachograph') : ta('noTachograph')}
            </p>
            {v.review_note ? <Note text={v.review_note} ta={ta} /> : null}
            {!v.verified_at && v.active ? <ReviewButtons lang={locale} kind="vehicle" id={v.id} companyId={company.id} testId={`review-vehicle-${v.plate}`} /> : null}
          </Item>
        ))}
      </Section>

      <Section title={ta('pricesAndAreas')}>
        <p className="text-sm text-ink-700">
          {ta('pricedVans', { priced: (cards.data ?? []).filter((c) => c.confirmed_by_mover_at).length, vans: vehicles.filter((v) => v.active).length })}
          {' · '}
          {(areas.data ?? []).map((a) => `${a.label ?? '?'} (${a.radius_km} km)`).join(', ') || ta('noAreas')}
        </p>
      </Section>

      <Section title={ta('decisionsTitle')}>
        <p className="text-sm text-ink-600">{ta('decisionsIntro')}</p>
        {decisions.map((d) => {
          const state = decisionState(d);
          return (
            <Item key={d.id} title={ta(`decide.kinds.${d.kind}`)} aside={<span className="text-xs font-medium text-ink-700">{ta(`decisionState.${state}`, { date: day(state === 'lifted' ? d.lifted_at : d.effective_at) })}</span>}>
              <p className="text-sm text-ink-700" data-testid={`admin-decision-${d.id}`}>
                {ta('toldOn', { date: day(d.notice_sent_at) })} · {ta(`flaggedBy.${d.flagged_by}`, { defaultValue: d.flagged_by })}
                {d.is_serious_violation ? ` · ${ta('seriousViolation')}` : ''}
              </p>
              <Note text={d.reason_text} ta={ta} label={ta('reasonsToMover')} />
              {d.mover_appeals.map((a) => (
                <AppealItem key={a.id} appeal={a} locale={locale} companyId={company.id} ta={ta} />
              ))}
              {state !== 'lifted' && !d.mover_appeals.some(waiting) ? <LiftForm lang={locale} companyId={company.id} suspensionId={d.id} /> : null}
            </Item>
          );
        })}
        <SuspendForm lang={locale} companyId={company.id} />
      </Section>

      {complaints.length ? (
        <Section title={ta('complaintsTitle')}>
          {complaints.map((c) => (
            <AppealItem key={c.id} appeal={c} locale={locale} companyId={company.id} ta={ta} />
          ))}
        </Section>
      ) : null}

      <Section title={ta('history')}>
        {(history ?? []).length === 0 ? <p className="text-sm text-ink-600">{ta('none')}</p> : null}
        <ul className="flex flex-col gap-1 text-sm text-ink-700">
          {((history ?? []) as Entry[]).map((h) => (
            <li key={`${h.created_at}-${h.entity}`}>
              {day(h.created_at)} · {ta(`entity.${h.entity}`, { defaultValue: h.entity })} · {ta(`action.${h.action}`, { defaultValue: h.action })}
              {h.note ? ` · “${h.note}”` : ''}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

type TA = ReturnType<typeof getAdminT>;

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-stone-300 bg-stone-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Item({ title, aside, children }: { title: string; aside: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-stone-300 pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-ink-900">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-500">{label}</dt>
          <dd className="text-ink-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Status({ value, ta }: { value: 'pending' | 'verified' | 'rejected' | 'inactive'; ta: TA }) {
  const tone = value === 'verified' ? 'bg-brand-500 text-stone-50' : value === 'rejected' ? 'bg-accent-500 text-ink-900' : 'bg-stone-300 text-ink-900';
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{ta(`status.${value}`)}</span>;
}

function Note({ text, ta, label }: { text: string; ta: TA; label?: string }) {
  return (
    <p className="rounded-md bg-stone-150 px-3 py-2 text-sm whitespace-pre-line text-ink-900">
      <span className="text-ink-500">{label ?? ta('noteToMover')}: </span>
      {text}
    </p>
  );
}

/** An appeal of a decision, or a complaint: what the mover wrote, and the answer or the form to give it. */
function AppealItem({ appeal, locale, companyId, ta }: { appeal: Appeal; locale: Locale; companyId: string; ta: TA }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-stone-300 p-3" data-testid={`admin-appeal-${appeal.id}`}>
      <p className="text-sm font-medium text-ink-900">
        {appeal.suspension_id ? ta('appealOn', { date: day(appeal.created_at) }) : ta('complaintOn', { date: day(appeal.created_at) })} ·{' '}
        {ta(`appealStatus.${appeal.status}`, { defaultValue: appeal.status })}
      </p>
      <p className="text-sm whitespace-pre-line text-ink-900">“{appeal.text}”</p>
      {appeal.decision_reason ? <Note text={appeal.decision_reason} ta={ta} label={ta('answerToMover', { date: day(appeal.resolved_at) })} /> : null}
      {waiting(appeal) ? <AnswerForm lang={locale} companyId={companyId} appealId={appeal.id} complaint={appeal.suspension_id === null} /> : null}
    </div>
  );
}
