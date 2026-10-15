import { describe, expect, it } from 'vitest';

import {
  documentMimeType,
  documentPath,
  documentStatus,
  documentsStepStatus,
  expiryError,
  formatExpiryDate,
  parseExpiryDate,
  requiredDocuments,
} from './mover-documents';

const now = new Date('2026-10-15T10:00:00Z');

describe('which documents', () => {
  it('a business uploads its register extract, a private person an ID; both the carrier insurance', () => {
    expect(requiredDocuments(true)).toEqual(['registration', 'insurance']);
    expect(requiredDocuments(false)).toEqual(['id', 'insurance']);
  });
});

describe('files', () => {
  it('knows PDFs and photos by type, or by name when the phone gives no type', () => {
    expect(documentMimeType('application/pdf', 'x.pdf')).toBe('application/pdf');
    expect(documentMimeType('image/jpg', 'scan')).toBe('image/jpeg');
    expect(documentMimeType(null, 'IMG_0042.HEIC')).toBe('image/heic');
    expect(documentMimeType(undefined, 'policy.jpeg')).toBe('image/jpeg');
    expect(documentMimeType('application/zip', 'x.zip')).toBeNull();
    expect(documentMimeType(null, 'notes.docx')).toBeNull();
  });

  it('puts each file under its company and type', () => {
    expect(documentPath('c0', 'insurance', 'f1', 'application/pdf')).toBe('c0/insurance/f1.pdf');
    expect(documentPath('c0', 'id', 'f2', 'image/jpeg')).toBe('c0/id/f2.jpg');
  });
});

describe('end dates', () => {
  it('reads the usual ways of writing a date, and refuses dates that do not exist', () => {
    for (const raw of ['31.12.2027', '31/12/2027', '31-12-2027', '2027-12-31', ' 31.12.2027 ']) expect(parseExpiryDate(raw)).toBe('2027-12-31');
    expect(parseExpiryDate('1.2.2028')).toBe('2028-02-01');
    for (const raw of ['31.02.2027', '2027-13-01', '12/2027', 'tomorrow', '']) expect(parseExpiryDate(raw)).toBeNull();
    expect(formatExpiryDate('2027-12-31')).toBe('31.12.2027');
  });

  it('is required for documents that end, and must be after today', () => {
    expect(expiryError('insurance', '', '2026-10-15')).toBe('expiry_required');
    expect(expiryError('insurance', '32.01.2027', '2026-10-15')).toBe('expiry_invalid');
    expect(expiryError('insurance', '15.10.2026', '2026-10-15')).toBe('expiry_past');
    expect(expiryError('insurance', '16.10.2026', '2026-10-15')).toBeNull();
    expect(expiryError('registration', '', '2026-10-15')).toBeNull();
  });
});

describe('status', () => {
  it('missing, waiting for the check, verified, ending within 30 days, expired', () => {
    expect(documentStatus(undefined, now)).toBe('missing');
    expect(documentStatus({ expires_at: '2027-12-31T23:59:59Z', verified_at: null }, now)).toBe('checking');
    expect(documentStatus({ expires_at: '2027-12-31T23:59:59Z', verified_at: '2026-10-01T00:00:00Z' }, now)).toBe('verified');
    expect(documentStatus({ expires_at: '2026-11-01T00:00:00Z', verified_at: '2026-10-01T00:00:00Z' }, now)).toBe('expiring');
    expect(documentStatus({ expires_at: '2026-10-01T00:00:00Z', verified_at: '2026-09-01T00:00:00Z' }, now)).toBe('expired');
    expect(documentStatus({ expires_at: null, verified_at: null }, now)).toBe('checking');
    expect(documentStatus({ expires_at: null, verified_at: null, review_note: 'Not readable.' }, now)).toBe('changes');
  });

  it('a required document MoversHub asked to replace makes the step "needs changes"', () => {
    const insurance = { type: 'insurance' as const, expires_at: '2027-12-31T23:59:59Z', verified_at: null, review_note: 'Not readable.' };
    const extract = { type: 'registration' as const, expires_at: null, verified_at: '2026-10-01T00:00:00Z' };
    expect(documentsStepStatus([insurance, extract], true, now)).toBe('rejected');
  });

  it("sums up the required documents for the setup checklist (cross-border ones don't count)", () => {
    const insurance = { type: 'insurance' as const, expires_at: '2027-12-31T23:59:59Z', verified_at: '2026-10-01T00:00:00Z' };
    const extract = { type: 'registration' as const, expires_at: null, verified_at: '2026-10-01T00:00:00Z' };
    expect(documentsStepStatus([], true, now)).toBe('todo');
    expect(documentsStepStatus([insurance], true, now)).toBe('todo');
    expect(documentsStepStatus([insurance, { ...extract, verified_at: null }], true, now)).toBe('saved');
    expect(documentsStepStatus([insurance, extract], true, now)).toBe('verified');
    expect(documentsStepStatus([{ ...insurance, expires_at: '2026-10-20T00:00:00Z' }, extract], true, now)).toBe('expiring');
    expect(documentsStepStatus([{ ...insurance, expires_at: '2026-10-01T00:00:00Z' }, extract], true, now)).toBe('expired');
    expect(documentsStepStatus([insurance, extract], false, now)).toBe('todo'); // a private person needs an ID
  });
});
