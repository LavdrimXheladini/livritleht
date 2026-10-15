import { describe, expect, it } from 'vitest';

import { latestReminders, reminderConsequence, type ReminderRow } from './reminders';

const row = (document: string, days: 0 | 3 | 14 | 30, type: ReminderRow['document_type'] = 'insurance'): ReminderRow => ({
  id: `00000000-0000-4000-8000-${String(days).padStart(4, '0')}${document.padStart(8, '0')}`,
  document_id: `00000000-0000-4000-8000-0000${document.padStart(8, '0')}`,
  document_type: type,
  kind: days === 0 ? 'document_ended' : 'document_ending',
  days_before: days,
  expires_at: '2026-11-21T00:00:00+00:00',
  created_at: '2026-11-01T05:07:00+00:00',
});

describe('reminders shown', () => {
  it('one per document, the nearest stage; ended ones first', () => {
    const shown = latestReminders([row('1', 30), row('1', 14), row('2', 3, 'cmr'), row('3', 0, 'licence')]);
    expect(shown.map((r) => [r.document_id.slice(-1), r.days_before])).toEqual([
      ['3', 0],
      ['2', 3],
      ['1', 14],
    ]);
  });

  it('say what the end means', () => {
    expect(reminderConsequence('insurance')).toBe('insurance');
    expect(reminderConsequence('cmr')).toBe('crossBorder');
    expect(reminderConsequence('licence')).toBe('crossBorder');
    expect(reminderConsequence('id')).toBe('id');
  });
});
