import { z } from 'zod';

import { DOCUMENT_TYPES } from './mover-documents';

// A mover's reminders (design/DECISIONS.md #30): before a document ends — 30, 14 and 3 days — and when
// it has ended (COMPLIANCE §5). Made daily on the server (`public.queue_document_reminders`); the app
// shows the unread ones on the mover's home.

export const reminderRowSchema = z.object({
  id: z.uuid(),
  document_id: z.uuid(),
  document_type: z.enum(DOCUMENT_TYPES),
  kind: z.enum(['document_ending', 'document_ended']),
  days_before: z.union([z.literal(0), z.literal(3), z.literal(14), z.literal(30)]),
  expires_at: z.string(),
  created_at: z.string(),
});
export type ReminderRow = z.infer<typeof reminderRowSchema>;
export const REMINDER_COLUMNS = Object.keys(reminderRowSchema.shape).join(',');

/**
 * One reminder per document: its latest (the nearest stage — "ended" before "3 days" before "14 days"…).
 * Earlier stages for the same document say less, so they aren't shown next to it. Ended ones first.
 */
export function latestReminders(rows: readonly ReminderRow[]): ReminderRow[] {
  const byDocument = new Map<string, ReminderRow>();
  for (const row of rows) {
    const shown = byDocument.get(row.document_id);
    if (!shown || row.days_before < shown.days_before) byDocument.set(row.document_id, row);
  }
  return [...byDocument.values()].sort((a, b) => a.days_before - b.days_before || a.expires_at.localeCompare(b.expires_at));
}

/** What a document's end means for the mover: no bookings at all, no moves across a border, or the account check. */
export function reminderConsequence(type: ReminderRow['document_type']): 'insurance' | 'crossBorder' | 'id' {
  if (type === 'insurance') return 'insurance';
  if (type === 'cmr' || type === 'licence') return 'crossBorder';
  return 'id';
}
