import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import {
  JOB_PHOTO_BUCKET,
  JOB_PHOTO_COLUMNS,
  MAX_JOB_PHOTO_BYTES,
  MAX_JOB_PHOTO_SOURCE_BYTES,
  MAX_JOB_PHOTOS_PER_STAGE,
  jobPhotoMimeType,
  jobPhotoPath,
  jobPhotoRowSchema,
  photoStageFor,
  stopGate,
  type JobPhotoRow,
  type JobPhotoStage,
  type MoverJobRow,
} from '@movershub/shared';
import { useAuth } from '@movershub/mobile';
import type { SupabaseClient } from '@supabase/supabase-js';

import { callFunction, withDeadline } from './functions';
import { moverJobsKey } from './jobs';

// Photos on the move day (design/DECISIONS.md #36; COMPLIANCE §7): the accepted mover adds at least one
// of the things at the pickup and at the drop-off. Each photo is made smaller and re-saved as JPEG on the
// device first (no location or camera data in the file), then sent — one at a time, the file into the
// private bucket `job-photos`, then its row into public.job_photos (Postgres sets the time). Photos not
// sent yet are kept on the phone (also across restarts) and sent again when the connection is back. If
// "Arrived" couldn't reach the server, the mover can take the photos anyway: they wait for that step.
// The files on the phone are deleted as soon as a photo is sent or removed (COMPLIANCE §9): the
// customer's things don't stay on the mover's phone.

export const jobPhotosKey = (jobId: string | undefined) => ['job-photos', jobId] as const;

/** The move's saved photos (RLS: the customer, the accepted mover, MoversHub), in the order they were added. */
export function useJobPhotos(jobId: string | undefined, { poll = false }: { poll?: boolean } = {}) {
  const { supabase } = useAuth();
  return useQuery({
    queryKey: jobPhotosKey(jobId),
    enabled: jobId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 20_000,
    refetchInterval: poll ? 30_000 : false,
    queryFn: async ({ signal }): Promise<JobPhotoRow[]> => {
      const { data, error } = await supabase
        .from('job_photos')
        .select(JOB_PHOTO_COLUMNS)
        .eq('job_id', jobId ?? '')
        .order('taken_at')
        .abortSignal(signal);
      if (error) throw error;
      return jobPhotoRowSchema.array().parse(data);
    },
  });
}

/** Links to the photos (valid for an hour), by path. */
export function usePhotoUrls(paths: readonly string[]) {
  const { supabase } = useAuth();
  const sorted = [...paths].sort();
  return useQuery({
    queryKey: ['job-photo-urls', ...sorted],
    enabled: sorted.length > 0,
    networkMode: 'always',
    retry: 1,
    staleTime: 45 * 60_000,
    // Signed for an hour: signed again before they expire on a screen left open.
    refetchInterval: 45 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.storage.from(JOB_PHOTO_BUCKET).createSignedUrls(sorted, 3600);
      if (error) throw error;
      const urls = new Map<string, string>();
      for (const one of data) if (one.path && one.signedUrl) urls.set(one.path, one.signedUrl);
      return urls;
    },
  });
}

/* ── The queue ────────────────────────────────────────────────────────────── */

/** Why a photo wasn't sent (the keys of mover.job.photos.errors). `upload_failed` is tried again by itself. */
export type PhotoProblem = 'upload_failed' | 'stage_closed' | 'limit' | 'file_type' | 'file_too_large' | 'refused';

export type QueuedPhoto = {
  /** The file's own id (also its name): made once, so a retry sends to the same place. */
  id: string;
  userId: string;
  jobId: string;
  stage: JobPhotoStage;
  path: string;
  /** The re-saved JPEG on the device. */
  uri: string;
  /** The file is in storage (only its row is left to write). */
  uploaded: boolean;
  state: 'queued' | 'sending' | 'sent' | 'failed';
  problem?: PhotoProblem;
  /** Tries of the row after Postgres didn't find the file. */
  missingRetries?: number;
};

/** An "Arrived" step the server hasn't confirmed yet (no connection): the photos of that stop wait for it. */
export type PendingArrival = { userId: string; jobId: string; to: 'AT_PICKUP' | 'AT_DROPOFF' };

type State = { items: QueuedPhoto[]; arrivals: PendingArrival[] };

let state: State = { items: [], arrivals: [] };
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  for (const l of listeners) l();
  void persist();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** What the queue works with: the signed-in mover's client, set by `useJobPhotoQueue`. */
let ctx: { supabase: SupabaseClient; userId: string; queryClient: QueryClient } | null = null;

const storageKey = (userId: string) => `movershub.jobPhotos.${userId}`;
// On the web, files picked in the browser can't be read again after a reload: nothing to keep.
const persistent = Platform.OS !== 'web';

async function persist() {
  if (!persistent || !ctx) return;
  const userId = ctx.userId;
  // Only photos that can still be sent are kept across a restart.
  const mine: State = {
    items: state.items.filter((i) => i.userId === userId && stillToSend(i)).map((i) => (i.state === 'sending' ? { ...i, state: 'queued' } : i)),
    arrivals: state.arrivals.filter((a) => a.userId === userId),
  };
  try {
    if (mine.items.length || mine.arrivals.length) await AsyncStorage.setItem(storageKey(userId), JSON.stringify(mine));
    else await AsyncStorage.removeItem(storageKey(userId));
  } catch {
    // Kept in memory only.
  }
}

async function restore(userId: string) {
  if (!persistent) return;
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const saved = raw ? (JSON.parse(raw) as Partial<State>) : null;
    if (!saved || ctx?.userId !== userId) return;
    const known = new Set(state.items.map((i) => i.id));
    set({
      items: [...state.items, ...(saved.items ?? []).filter((i) => !known.has(i.id))],
      arrivals: [...state.arrivals, ...(saved.arrivals ?? []).filter((a) => !state.arrivals.some((b) => b.jobId === a.jobId))],
    });
  } catch {
    // Nothing kept.
  }
}

const update = (id: string, patch: Partial<QueuedPhoto>) => set({ ...state, items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

/** Deletes a photo's file on this device (the picker's copy or the re-saved one); in the browser, frees it. */
function discard(uri: string | undefined) {
  if (!uri) return;
  try {
    if (Platform.OS === 'web') {
      if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
      return;
    }
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or the system's to clear.
  }
}

/** A photo that can still be sent: waiting, sending, or failed only for lack of a connection (tried again by itself). */
const stillToSend = (i: QueuedPhoto) => i.state === 'queued' || i.state === 'sending' || (i.state === 'failed' && i.problem === 'upload_failed');

/** Drops a photo from the queue and deletes its file. */
function drop(id: string) {
  const item = state.items.find((i) => i.id === id);
  set({ ...state, items: state.items.filter((i) => i.id !== id) });
  discard(item?.uri);
}

/** The queued photos of a move (this device). */
export function useQueuedPhotos(jobId: string | undefined): QueuedPhoto[] {
  const items = useSyncExternalStore(subscribe, () => state.items, () => state.items);
  return items.filter((i) => i.jobId === jobId && i.userId === ctx?.userId);
}

/** The arrival this device is still trying to send for the move, if any. */
export function usePendingArrival(jobId: string | undefined): PendingArrival['to'] | null {
  const arrivals = useSyncExternalStore(subscribe, () => state.arrivals, () => state.arrivals);
  return arrivals.find((a) => a.jobId === jobId && a.userId === ctx?.userId)?.to ?? null;
}

/** Photos not sent yet, or an "Arrived" still to send (asked before signing out or leaving the page). */
const pendingFor = (userId: string | undefined) =>
  state.items.some((i) => i.userId === userId && stillToSend(i)) || state.arrivals.some((a) => a.userId === userId);
export const hasPendingPhotos = () => pendingFor(ctx?.userId);

/** Forgets this mover's queue and deletes its files from the device (signing out). */
export function clearJobPhotoQueue() {
  const userId = ctx?.userId;
  if (!userId) return;
  const mine = state.items.filter((i) => i.userId === userId);
  set({ items: state.items.filter((i) => i.userId !== userId), arrivals: state.arrivals.filter((a) => a.userId !== userId) });
  for (const i of mine) discard(i.uri);
  if (persistent) void AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);
}

/** A signal that aborts after `ms` (AbortSignal.timeout isn't on every phone). */
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

const newFileId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** Made smaller (1600 px on the long side) and saved again as JPEG: smaller uploads, and no location or camera data. */
async function reencode(uri: string, width: number | null | undefined, height: number | null | undefined): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    const long = Math.max(width ?? 0, height ?? 0);
    if (long > 1600) context.resize((width ?? 0) >= (height ?? 0) ? { width: 1600 } : { height: 1600 });
    image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return saved.uri;
  } finally {
    // The bitmaps live in native memory: free them now, not when the JS garbage collector runs.
    image?.release();
    context.release();
  }
}

/** A photo from the camera (or, in the browser, a file). */
export type TakenPhoto = { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null; width?: number | null; height?: number | null };

/**
 * Adds a photo of the stop to the queue and starts sending it. Refused at once: not a photo the
 * browsers show (HEIC, PDF …), too large to open (the re-saved photo must be under 10 MB), or the stop
 * already has its 20. The picker's own file is deleted once the photo is re-saved (or refused).
 */
export async function addJobPhoto(jobId: string, stage: JobPhotoStage, photo: TakenPhoto, savedCount: number): Promise<PhotoProblem | null> {
  if (!ctx) return 'refused';
  const userId = ctx.userId;
  const refuse = (problem: PhotoProblem) => {
    discard(photo.uri);
    return problem;
  };
  if (!jobPhotoMimeType(photo.mimeType, photo.fileName)) return refuse('file_type');
  // A phone's full-resolution capture can be large: it is made small below. Only what can't be opened safely is refused.
  if (photo.fileSize && photo.fileSize > MAX_JOB_PHOTO_SOURCE_BYTES) return refuse('file_too_large');
  const waiting = state.items.filter((i) => i.jobId === jobId && i.stage === stage && (i.state === 'queued' || i.state === 'sending')).length;
  if (savedCount + waiting >= MAX_JOB_PHOTOS_PER_STAGE) return refuse('limit');
  let uri: string;
  try {
    uri = await reencode(photo.uri, photo.width, photo.height);
  } catch {
    return refuse('file_type');
  }
  discard(photo.uri);
  const id = newFileId();
  set({ ...state, items: [...state.items, { id, userId, jobId, stage, path: jobPhotoPath(jobId, stage, id, 'image/jpeg'), uri, uploaded: false, state: 'queued' }] });
  void pump();
  return null;
}

/** "Try again" on a photo that wasn't sent. */
export function retryJobPhoto(id: string) {
  update(id, { state: 'queued', problem: undefined, missingRetries: 0 });
  void pump();
}

/**
 * "Remove": drops a photo that wasn't sent and deletes it from the device. A file that already reached
 * storage without its row stays there until MoversHub's cleanup removes such files (COMPLIANCE-TODO: §14).
 */
export function removeJobPhoto(id: string) {
  drop(id);
}

/** Remembers an "Arrived" that couldn't reach the server; it is sent again until it does. */
export function setPendingArrival(jobId: string, to: PendingArrival['to']) {
  if (!ctx) return;
  const userId = ctx.userId;
  set({ ...state, arrivals: [...state.arrivals.filter((a) => a.jobId !== jobId), { userId, jobId, to }] });
}

const arrivalFor = (jobId: string) => state.arrivals.find((a) => a.jobId === jobId && a.userId === ctx?.userId);

/** Listeners for an "Arrived" that finally got through (the job screen reads it out). */
const arrivedListeners = new Set<(jobId: string, to: PendingArrival['to']) => void>();
export function onArrivalSent(listener: (jobId: string, to: PendingArrival['to']) => void) {
  arrivedListeners.add(listener);
  return () => {
    arrivedListeners.delete(listener);
  };
}

/** A refusal that may pass on its own: no connection, too many requests, or the server briefly unavailable. */
const passing = (status: number) => status === 0 || status === 429 || status >= 500;

/**
 * A database answer that may pass on its own: PostgREST's own (PGRST…: e.g. the database unreachable), a
 * lost connection (08…), a transaction to retry (40…), the server out of resources (53…) or stopped a
 * query (57…), or the gateway (429, 502–504). Not the job functions' refusals, which come with codes of
 * their own (22023, P0002 …).
 */
const transientDbError = (code: string, status: number) =>
  code.startsWith('PGRST') || /^(08|40|53|57)/.test(code) || status === 429 || status === 502 || status === 503 || status === 504;

/** Sends the pending "Arrived" steps; one is kept until the server has answered for good. */
async function sendArrivals(): Promise<void> {
  for (const arrival of state.arrivals.filter((a) => a.userId === ctx?.userId)) {
    if (!ctx) return;
    const answer = await callFunction<{ status: string }>(ctx.supabase, 'job-transition', { action: 'step', jobId: arrival.jobId, to: arrival.to });
    if (!answer.ok && passing(answer.status)) continue;
    // Done — or the move went on or was cancelled meanwhile (the photos then can't be added: they say so).
    set({ ...state, arrivals: state.arrivals.filter((a) => a !== arrival) });
    void ctx.queryClient.invalidateQueries({ queryKey: moverJobsKey(ctx.userId) });
    if (answer.ok) for (const l of arrivedListeners) l(arrival.jobId, arrival.to);
  }
}

let pumping = false;

/** Sends the queued photos, one at a time, oldest first; photos waiting for their "Arrived" stay queued. */
async function pump(): Promise<void> {
  if (pumping || !ctx) return;
  pumping = true;
  try {
    await sendArrivals();
    for (;;) {
      const next = state.items.find((i) => i.userId === ctx?.userId && i.state === 'queued' && arrivalFor(i.jobId)?.to !== stageStatus(i.stage));
      if (!next || !ctx) break;
      await send(next);
    }
  } finally {
    pumping = false;
  }
}

const stageStatus = (stage: JobPhotoStage) => (stage === 'pickup' ? 'AT_PICKUP' : 'AT_DROPOFF');

/** Whether the move is still at that photo's stop (asks the server again first). */
async function stillAtStop(item: QueuedPhoto): Promise<boolean> {
  if (!ctx) return false;
  await withDeadline(ctx.queryClient.refetchQueries({ queryKey: moverJobsKey(ctx.userId) }), 20_000, undefined);
  const rows = ctx.queryClient.getQueryData<MoverJobRow[]>(moverJobsKey(ctx.userId));
  const row = rows?.find((r) => r.job_id === item.jobId && r.offer_status === 'accepted');
  return !!row && photoStageFor(row.status) === item.stage;
}

/** Whether the photo's row is already saved (an answer that got lost). */
async function alreadySaved(item: QueuedPhoto): Promise<boolean> {
  if (!ctx) return false;
  await withDeadline(ctx.queryClient.refetchQueries({ queryKey: jobPhotosKey(item.jobId) }), 20_000, undefined);
  return !!ctx.queryClient.getQueryData<JobPhotoRow[]>(jobPhotosKey(item.jobId))?.some((r) => r.path === item.path);
}

async function upload(item: QueuedPhoto): Promise<'ok' | PhotoProblem> {
  if (!ctx) return 'upload_failed';
  // Renewing the session can stall on a bad connection: it gets the same deadline as the rest.
  const session = await withDeadline(ctx.supabase.auth.getSession(), 20_000, null);
  const token = session?.data.session?.access_token;
  if (!token) return 'upload_failed';
  let res: Response;
  try {
    const bytes = await (await fetch(item.uri)).arrayBuffer();
    if (bytes.byteLength > MAX_JOB_PHOTO_BYTES) return 'file_too_large';
    res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/${JOB_PHOTO_BUCKET}/${item.path}`, {
      method: 'POST',
      headers: {
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
      },
      body: bytes,
      signal: timeoutSignal(60_000),
    });
  } catch {
    return 'upload_failed';
  }
  if (res.ok) return 'ok';
  // Storage often answers 400 with the real status in the body.
  const body = (await res.json().catch(() => ({}))) as { statusCode?: string | number; error?: string; message?: string };
  const code = String(body.statusCode ?? res.status);
  const text = `${body.error ?? ''} ${body.message ?? ''}`;
  if (code === '409' || /duplicate|already exists/i.test(text)) return 'ok';
  if (code === '413' || /too large|maximum allowed size/i.test(text)) return 'file_too_large';
  if (/mime/i.test(text)) return 'file_type';
  if (code === '403' || /row-level security|unauthorized/i.test(text)) return (await stillAtStop(item)) ? 'limit' : 'stage_closed';
  return 'upload_failed';
}

async function saveRow(item: QueuedPhoto): Promise<'ok' | 'missing' | PhotoProblem> {
  if (!ctx) return 'upload_failed';
  const answer = await withDeadline(
    Promise.resolve(
      ctx.supabase
        .from('job_photos')
        .insert({ job_id: item.jobId, stage: item.stage, path: item.path })
        .select(JOB_PHOTO_COLUMNS)
        .abortSignal(timeoutSignal(20_000))
        .single(),
    ),
    25_000,
    null,
  );
  // No answer in time (also while the session renews): sent again later; a row saved meanwhile answers 23505.
  if (!answer) return 'upload_failed';
  const { data, error, status } = answer;
  if (!error) {
    const row = jobPhotoRowSchema.parse(data);
    ctx.queryClient.setQueryData<JobPhotoRow[]>(jobPhotosKey(item.jobId), (rows = []) => (rows.some((r) => r.id === row.id) ? rows : [...rows, row]));
    return 'ok';
  }
  if (error.code === '23505') return 'ok';
  // No answer (the connection, or the 20 seconds), or the database briefly unavailable: sent again later.
  // A refusal of our own (e.g. not_found, P0002 — which PostgREST answers with HTTP 500) is final.
  if (!error.code || transientDbError(error.code, status)) return 'upload_failed';
  if (error.message.includes('photo_file_missing')) return 'missing';
  if (error.message.includes('photo_stage_closed')) return (await alreadySaved(item)) ? 'ok' : 'stage_closed';
  if (error.message.includes('too_many_photos')) return (await alreadySaved(item)) ? 'ok' : 'limit';
  return 'refused';
}

async function send(item: QueuedPhoto): Promise<void> {
  update(item.id, { state: 'sending', problem: undefined });
  let uploaded = item.uploaded;
  if (!uploaded) {
    const result = await upload(item);
    if (result === 'stage_closed') return drop(item.id);
    if (result !== 'ok') return update(item.id, { state: 'failed', problem: result });
    uploaded = true;
    update(item.id, { uploaded: true });
  }
  const saved = await saveRow({ ...item, uploaded });
  if (saved === 'ok') {
    // Sent: the file on the device goes (the thumbnail now comes from storage).
    discard(item.uri);
    update(item.id, { state: 'sent', uri: '' });
    void ctx?.queryClient.invalidateQueries({ queryKey: jobPhotosKey(item.jobId) });
    return;
  }
  if (saved === 'missing') {
    // The file isn't in storage after all: send it again, once.
    const tries = (item.missingRetries ?? 0) + 1;
    return update(item.id, tries > 1 ? { state: 'failed', problem: 'upload_failed', uploaded: false } : { state: 'queued', uploaded: false, missingRetries: tries });
  }
  // The move has left that stop: the photo can never be added — it goes (an uploaded file is cleaned up later).
  if (saved === 'stage_closed') return drop(item.id);
  update(item.id, { state: 'failed', problem: saved });
}

/** Photos that failed for lack of a connection are tried again by themselves. */
function retryNetworkFailures() {
  const again = state.items.filter((i) => i.userId === ctx?.userId && i.state === 'failed' && i.problem === 'upload_failed');
  if (again.length) set({ ...state, items: state.items.map((i) => (again.includes(i) ? { ...i, state: 'queued', problem: undefined } : i)) });
  void pump();
}

/** The one running queue: started by the first screen that uses it, stopped when the last one goes. */
let running: { userId: string; users: number; stop: () => void } | null = null;

function start(supabase: SupabaseClient, userId: string, queryClient: QueryClient): () => void {
  ctx = { supabase, userId, queryClient };
  void restore(userId).then(() => pump());
  const timer = setInterval(() => {
    if (hasPendingPhotos()) retryNetworkFailures();
  }, 15_000);
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') retryNetworkFailures();
  });
  // In the browser nothing survives a reload: leaving with photos still to send asks first.
  const leaving = (e: BeforeUnloadEvent) => {
    if (pendingFor(userId)) e.preventDefault();
  };
  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  if (web) window.addEventListener('beforeunload', leaving);
  return () => {
    clearInterval(timer);
    appState.remove();
    if (web) window.removeEventListener('beforeunload', leaving);
  };
}

/**
 * Runs the queue for the signed-in mover (the job screen and the mover home use it): restores what was
 * kept on the phone, sends again every 15 seconds while something waits, and when the app comes back.
 * On the web, leaving the page with photos not sent asks first.
 */
export function useJobPhotoQueue() {
  const { supabase, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    if (running && running.userId !== userId) {
      running.stop();
      running = null;
    }
    if (running) running.users += 1;
    else running = { userId, users: 1, stop: start(supabase, userId, queryClient) };
    return () => {
      if (!running || running.userId !== userId) return;
      running.users -= 1;
      if (running.users === 0) {
        running.stop();
        running = null;
      }
    };
  }, [supabase, userId, queryClient]);
}

/** Whether the mover can leave the stop: the server's photos, plus this device's sent, sending and failed ones. */
export function stopGateFor(rows: readonly JobPhotoRow[], queued: readonly QueuedPhoto[], stage: JobPhotoStage) {
  const saved = new Set(rows.filter((r) => r.stage === stage).map((r) => r.path));
  for (const q of queued) if (q.stage === stage && q.state === 'sent') saved.add(q.path);
  const mine = queued.filter((q) => q.stage === stage && !saved.has(q.path));
  return {
    gate: stopGate({ saved: saved.size, pending: mine.filter((q) => q.state === 'queued' || q.state === 'sending').length, failed: mine.filter((q) => q.state === 'failed').length }),
    saved: saved.size,
    pending: mine.filter((q) => q.state === 'queued' || q.state === 'sending').length,
  };
}
