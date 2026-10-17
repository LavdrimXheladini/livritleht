import { z } from 'zod';

import type { JobStatus } from '../constants';

// Photos on the move day (design/DECISIONS.md #36; COMPLIANCE §7): evidence of the things' state at
// each handover, not control (§2). The accepted mover adds at least one at the pickup before loading
// and at the drop-off after unloading — what and how many (up to 20 per stop) is theirs to decide.
// Mirrors the private bucket `job-photos` and public.job_photos (migration 20261017130000).

export const JOB_PHOTO_BUCKET = 'job-photos';
export const JOB_PHOTO_STAGES = ['pickup', 'dropoff'] as const;
export type JobPhotoStage = (typeof JOB_PHOTO_STAGES)[number];

/** Photos only, in formats every browser shows (the customer and MoversHub view them on the web): no HEIC. */
export const JOB_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type JobPhotoMimeType = (typeof JOB_PHOTO_MIME_TYPES)[number];
export const MAX_JOB_PHOTO_BYTES = 10 * 1024 * 1024;
/**
 * The largest original the app opens: a phone's full-resolution capture can be far over 10 MB, and the
 * app makes every photo small (≤ 1600 px JPEG) before sending it — only the sent file must be under 10 MB.
 */
export const MAX_JOB_PHOTO_SOURCE_BYTES = 50 * 1024 * 1024;
export const MAX_JOB_PHOTOS_PER_STAGE = 20;

const EXTENSIONS: Record<JobPhotoMimeType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** The photo's type from its MIME type or (when the phone gives none) its name; null for anything else. */
export function jobPhotoMimeType(mime: string | null | undefined, name?: string | null): JobPhotoMimeType | null {
  const m = mime?.toLowerCase();
  if (m === 'image/jpg') return 'image/jpeg';
  if (m && (JOB_PHOTO_MIME_TYPES as readonly string[]).includes(m)) return m as JobPhotoMimeType;
  if (m && m !== 'application/octet-stream') return null;
  const ext = /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1]?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

/** A photo's own id in its path: made once on the device, so a retry uploads to the same place. */
export const JOB_PHOTO_FILE_ID = /^[a-z0-9]{6,64}$/;

/** Where a photo goes: `<job id>/<pickup|dropoff>/<file id>.<jpg|png|webp>` (storage policies check every part). */
export const jobPhotoPath = (jobId: string, stage: JobPhotoStage, fileId: string, mime: JobPhotoMimeType) =>
  `${jobId}/${stage}/${fileId}.${EXTENSIONS[mime]}`;

/** Which stop's photos the mover can add now: at the pickup, at the drop-off, else none. */
export function photoStageFor(status: JobStatus): JobPhotoStage | null {
  if (status === 'AT_PICKUP') return 'pickup';
  if (status === 'AT_DROPOFF') return 'dropoff';
  return null;
}

/**
 * Whether the mover can leave the stop (the server checks again): a photo that failed comes first, then
 * one still sending, then none saved yet.
 */
export function stopGate({ saved, pending, failed }: { saved: number; pending: number; failed: number }): 'fix_failed' | 'uploading' | 'need_photo' | 'ok' {
  if (failed > 0) return 'fix_failed';
  if (pending > 0) return 'uploading';
  if (saved === 0) return 'need_photo';
  return 'ok';
}

/** A photo row as the customer and the mover read it (who added it stays with MoversHub). */
export const jobPhotoRowSchema = z.object({
  id: z.uuid(),
  job_id: z.uuid(),
  stage: z.enum(JOB_PHOTO_STAGES),
  path: z.string(),
  /** The server's time it was added, during the stop. */
  taken_at: z.string(),
});
export type JobPhotoRow = z.infer<typeof jobPhotoRowSchema>;
export const JOB_PHOTO_COLUMNS = Object.keys(jobPhotoRowSchema.shape).join(',');

/** Why Postgres refused a photo row (the trigger on public.job_photos). */
export const JOB_PHOTO_ERRORS = ['photo_stage_closed', 'photo_path_outside_job', 'photo_file_missing', 'too_many_photos'] as const;
export type JobPhotoError = (typeof JOB_PHOTO_ERRORS)[number];
