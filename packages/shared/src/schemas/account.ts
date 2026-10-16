import { z } from 'zod';

import type { JobStatus } from '../constants';
import { signInPasswordSchema } from './auth';

// The `account` function (design/DECISIONS.md #31; COMPLIANCE §9: people can download and delete their
// data): `export` — everything MoversHub keeps about the signed-in person, as JSON; `delete` — the
// account and its data, after the password is typed again.

export const accountRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('export') }).strict(),
  z.object({ action: z.literal('delete'), password: signInPasswordSchema }).strict(),
]);
export type AccountRequest = z.infer<typeof accountRequestSchema>;

/**
 * Moves that may simply go with an account: never booked. Anything further (booked, done, cancelled,
 * disputed) is a record to keep — tax, disputes — and stops the deletion until it can be anonymised
 * (COMPLIANCE §9, §14). None exist before payments.
 */
export const DELETABLE_JOB_STATUSES = ['DRAFT', 'QUOTED'] as const satisfies readonly JobStatus[];

/** Why a deletion was refused. */
export type AccountDeleteError = 'wrong_password' | 'records_kept' | 'admins_only_by_platform';

/** The name of the file the export is saved as: `movershub-data-2026-10-16.json`. */
export const exportFileName = (at: Date) => `movershub-data-${at.toISOString().slice(0, 10)}.json`;
