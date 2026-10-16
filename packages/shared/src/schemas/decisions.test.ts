import { describe, expect, it } from 'vitest';

import { DECISION_COLUMNS, appealFormSchema, canAppeal, decisionState, decisionsToShow, type AppealRow, type DecisionRow } from './decisions';

const now = new Date('2026-11-10T12:00:00Z');

const decision = (id: string, over: Partial<DecisionRow> = {}): DecisionRow => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  kind: 'suspension',
  reason_text: 'Three customers reported damaged furniture this month.',
  is_serious_violation: false,
  notice_sent_at: '2026-11-01T09:00:00Z',
  effective_at: '2026-11-01T09:00:00Z',
  lifted_at: null,
  mover_appeals: [],
  ...over,
});

const appeal = (status: AppealRow['status'], created = '2026-11-02T09:00:00Z'): AppealRow => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  suspension_id: '00000000-0000-4000-8000-000000000001',
  subject: 'suspension',
  text: 'The damage happened before pickup.',
  status,
  decision_reason: status === 'open' ? null : 'The photos show it.',
  created_at: created,
  resolved_at: status === 'open' ? null : '2026-11-03T09:00:00Z',
});

describe('decisions about a mover', () => {
  it('stand: coming, in force, lifted', () => {
    expect(decisionState(decision('1'), now)).toBe('in_force');
    expect(decisionState(decision('1', { kind: 'termination', effective_at: '2026-12-01T09:00:00Z' }), now)).toBe('coming');
    expect(decisionState(decision('1', { lifted_at: '2026-11-05T09:00:00Z' }), now)).toBe('lifted');
  });

  it('can be appealed while they apply, one appeal waiting at a time (again after a rejection)', () => {
    expect(canAppeal(decision('1'), now)).toBe(true);
    expect(canAppeal(decision('1', { mover_appeals: [appeal('open')] }), now)).toBe(false);
    expect(canAppeal(decision('1', { mover_appeals: [appeal('rejected')] }), now)).toBe(true);
    expect(canAppeal(decision('1', { lifted_at: '2026-11-05T09:00:00Z' }), now)).toBe(false);
  });

  it('on the home: what applies first, then what is coming, then lifted in the last week', () => {
    const shown = decisionsToShow(
      [
        decision('1', { lifted_at: '2026-11-08T09:00:00Z' }),
        decision('2', { lifted_at: '2026-10-20T09:00:00Z' }),
        decision('3', { kind: 'termination', effective_at: '2026-12-01T09:00:00Z' }),
        decision('4'),
      ],
      now,
    );
    expect(shown.map((d) => d.id.slice(-1))).toEqual(['4', '3', '1']);
  });

  it('are read with their appeals in one request', () => {
    expect(DECISION_COLUMNS).toMatch(/^id,kind,reason_text,.*,lifted_at,mover_appeals\(id,suspension_id,subject,text,status,decision_reason,created_at,resolved_at\)$/);
  });
});

describe('an appeal', () => {
  it('says why in 10 to 4000 characters', () => {
    expect(appealFormSchema.safeParse({ text: '  too short ' }).error?.issues[0]?.message).toBe('appeal_too_short');
    expect(appealFormSchema.safeParse({ text: 'x'.repeat(4001) }).error?.issues[0]?.message).toBe('appeal_too_long');
    expect(appealFormSchema.parse({ text: '  The damage happened before pickup.  ' }).text).toBe('The damage happened before pickup.');
  });
});
