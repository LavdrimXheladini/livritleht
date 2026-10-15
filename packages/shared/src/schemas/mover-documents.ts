import { z } from 'zod';

/** Mirrors the Postgres enum `mover_document_type`. */
export const DOCUMENT_TYPES = ['registration', 'id', 'insurance', 'cmr', 'licence'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * What a mover uploads (COMPLIANCE §5, design/DECISIONS.md #20): the company register extract — or,
 * for a private person, an ID document — and the carrier's liability insurance. For cross-border jobs
 * also the CMR insurance and the EU operator licence (needed over 2.5 t; MoversHub checks which
 * vehicles need it). Movers without the cross-border documents get no cross-border jobs (§11).
 */
export function requiredDocuments(isBusiness: boolean): readonly DocumentType[] {
  return isBusiness ? ['registration', 'insurance'] : ['id', 'insurance'];
}
export const CROSS_BORDER_DOCUMENTS: readonly DocumentType[] = ['cmr', 'licence'];

/** Documents with an end date: the date is required, and an expired one doesn't count (§5). */
export const documentNeedsExpiry = (type: DocumentType) => type !== 'registration';

/** Uploads: PDF or a photo, at most 10 MB — the same limits as the storage bucket `mover-documents`. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];
const EXTENSIONS: Record<DocumentMimeType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
};

/** The file type of an upload, from its MIME type or (when the phone gives none) its name. */
export function documentMimeType(mime: string | null | undefined, name: string | null | undefined): DocumentMimeType | null {
  const m = mime?.toLowerCase();
  if (m && (DOCUMENT_MIME_TYPES as readonly string[]).includes(m)) return m as DocumentMimeType;
  if (m === 'image/jpg') return 'image/jpeg';
  const ext = /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1]?.toLowerCase();
  const byExt = Object.entries(EXTENSIONS).find(([, e]) => e === ext || (ext === 'jpeg' && e === 'jpg'));
  return byExt ? (byExt[0] as DocumentMimeType) : null;
}

/**
 * Where a document's file goes in the private bucket: `<company id>/<type>/<random id>.<ext>`. Storage
 * policies let only the company's owner (and the service role) read or add files under the company id.
 */
export const documentPath = (companyId: string, type: DocumentType, fileId: string, mime: DocumentMimeType) =>
  `${companyId}/${type}/${fileId}.${EXTENSIONS[mime]}`;

/**
 * An end date as people type it — "31.12.2027", "31/12/2027", "31-12-2027" or "2027-12-31" — as an ISO
 * date, or null when it isn't a real date.
 */
export function parseExpiryDate(raw: string): string | null {
  const s = raw.trim();
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const [year, month, day] = dmy ? [dmy[3], dmy[2], dmy[1]] : ymd ? [ymd[1], ymd[2], ymd[3]] : [];
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return date.toISOString().slice(0, 10);
}

/** "2027-12-31" → "31.12.2027" (how the form shows a saved date). */
export const formatExpiryDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

/** The end date field: required for documents that expire, a real date, not already past. */
export function expiryError(type: DocumentType, raw: string, today: string): 'expiry_required' | 'expiry_invalid' | 'expiry_past' | null {
  if (!documentNeedsExpiry(type)) return null;
  if (raw.trim() === '') return 'expiry_required';
  const iso = parseExpiryDate(raw);
  if (!iso) return 'expiry_invalid';
  return iso <= today ? 'expiry_past' : null;
}

/** A document row as the app reads it (RLS: the company's owner only). */
export const moverDocumentRowSchema = z.object({
  id: z.uuid(),
  type: z.enum(DOCUMENT_TYPES),
  file_path: z.string(),
  expires_at: z.string().nullable(),
  verified_at: z.string().nullable(),
  updated_at: z.string(),
});
export type MoverDocumentRow = z.infer<typeof moverDocumentRowSchema>;
export const MOVER_DOCUMENT_COLUMNS = Object.keys(moverDocumentRowSchema.shape).join(', ');

/** Days before the end date from which the app warns (the reminders are sent 30, 14 and 3 days before, §5). */
export const EXPIRY_WARNING_DAYS = 30;

export type DocumentStatus = 'missing' | 'checking' | 'verified' | 'expiring' | 'expired';

/** Where one document stands on `now`. */
export function documentStatus(row: Pick<MoverDocumentRow, 'expires_at' | 'verified_at'> | undefined, now: Date): DocumentStatus {
  if (!row) return 'missing';
  if (row.expires_at) {
    const end = new Date(row.expires_at).getTime();
    if (end <= now.getTime()) return 'expired';
    if (end - now.getTime() <= EXPIRY_WARNING_DAYS * 86_400_000) return 'expiring';
  }
  return row.verified_at ? 'verified' : 'checking';
}

/**
 * The checklist's summary for the required documents: all verified, all uploaded (waiting for the
 * check), something missing or expired, or a document ending soon.
 */
export function documentsStepStatus(
  rows: readonly Pick<MoverDocumentRow, 'type' | 'expires_at' | 'verified_at'>[],
  isBusiness: boolean,
  now: Date,
): 'todo' | 'saved' | 'verified' | 'expiring' | 'expired' {
  const statuses = requiredDocuments(isBusiness).map((type) => documentStatus(rows.find((r) => r.type === type), now));
  if (statuses.includes('expired')) return 'expired';
  if (statuses.includes('missing')) return 'todo';
  if (statuses.includes('expiring')) return 'expiring';
  return statuses.every((s) => s === 'verified') ? 'verified' : 'saved';
}
