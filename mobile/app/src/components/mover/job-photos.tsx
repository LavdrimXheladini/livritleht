import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Text, View } from 'react-native';

import { Button, formatClockTime, useAnnouncement } from '@movershub/mobile';
import { MAX_JOB_PHOTOS_PER_STAGE, resolveLocale, type JobPhotoRow, type JobPhotoStage } from '@movershub/shared';

import {
  addJobPhoto,
  removeJobPhoto,
  retryJobPhoto,
  usePhotoUrls,
  type PhotoProblem,
  type QueuedPhoto,
  type TakenPhoto,
} from '@/lib/job-photos';

type Problem = PhotoProblem | 'camera_denied';

/**
 * The photos of one stop (design/DECISIONS.md #36; COMPLIANCE §7): at least one of the things, as the
 * mover receives or hands them over — what to photograph is up to them; the photos are evidence for both
 * sides, never a score (§2, §3). The camera on phones; in the browser a photo file (or the camera on a
 * phone's browser). Each photo shows whether it is sent; one that wasn't can be tried again or removed.
 */
export function StopPhotos({
  jobId,
  stage,
  rows,
  queued,
  waitingForArrival,
}: {
  jobId: string;
  stage: JobPhotoStage;
  /** The move's saved photos (all stops). */
  rows: readonly JobPhotoRow[];
  /** This device's photos of the move. */
  queued: readonly QueuedPhoto[];
  /** "Arrived" hasn't reached the server yet: the photos wait for it. */
  waitingForArrival: boolean;
}) {
  const { t: tj, i18n } = useTranslation('job');
  const locale = resolveLocale(i18n.language);
  const [problem, setProblem] = useState<{ key: Problem; attempt: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const saved = rows.filter((r) => r.stage === stage);
  const savedPaths = new Set(saved.map((r) => r.path));
  const mine = queued.filter((q) => q.stage === stage && !savedPaths.has(q.path));
  const total = saved.length + mine.filter((q) => q.state !== 'failed').length;
  const problemText = problem ? tj(`mover.photos.errors.${problem.key}`, { max: MAX_JOB_PHOTOS_PER_STAGE }) : undefined;
  useAnnouncement(problemText, problem?.attempt);
  const fail = (key: Problem) => setProblem((p) => ({ key, attempt: (p?.attempt ?? 0) + 1 }));

  const add = async (photo: TakenPhoto) => {
    const refused = await addJobPhoto(jobId, stage, photo, saved.length);
    if (refused) fail(refused);
    else setProblem(null);
  };

  // Android may close the app while the camera is open (low memory): the photo taken then comes back here.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void ImagePicker.getPendingResultAsync().then((result) => {
      const assets = result && 'assets' in result && !result.canceled ? result.assets : [];
      for (const asset of assets ?? []) void add(asset);
    });
    // Once, when the stop's photos open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const take = async () => {
    setAdding(true);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return fail('camera_denied');
      }
      // In the browser a file that isn't a picture (e.g. a PDF) is refused by the picker itself.
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, exif: false }).catch(() => null);
      if (!result) return fail('file_type');
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset) await add(asset);
    } finally {
      setAdding(false);
    }
  };

  // A photo still on this phone shows from there; a sent one (its file deleted) from storage.
  const localUri = (path: string) => queued.find((q) => q.path === path && q.uri)?.uri;
  const urls = usePhotoUrls(saved.filter((r) => !localUri(r.path)).map((r) => r.path));
  const stateText = (q: QueuedPhoto) =>
    q.state === 'failed'
      ? tj('mover.photos.notSent')
      : waitingForArrival && q.state === 'queued'
        ? tj('mover.photos.waiting')
        : q.state === 'sent'
          ? tj('mover.photos.sent')
          : tj('mover.photos.sending');

  return (
    <View testID={`mover-job-photos-${stage}`} className="gap-3">
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-semibold text-[15px] text-night-50">
          {tj(stage === 'pickup' ? 'mover.photos.pickupTitle' : 'mover.photos.dropoffTitle')}
        </Text>
        <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{tj(stage === 'pickup' ? 'mover.photos.pickupText' : 'mover.photos.dropoffText')}</Text>
        <Text className="font-sans text-[12.5px] text-sage-400">{tj('mover.photos.count', { count: total, max: MAX_JOB_PHOTOS_PER_STAGE })}</Text>
      </View>

      <View accessibilityRole="list" className="flex-row flex-wrap gap-2">
        {saved.map((r, i) => (
          <View
            key={r.id}
            testID={`mover-job-photo-${fileIdOf(r.path)}`}
            accessible
            accessibilityRole="image"
            accessibilityLabel={tj('mover.photos.label', { n: i + 1, total, time: formatClockTime(r.taken_at, locale) })}
            className="gap-1"
          >
            <Thumb uri={localUri(r.path) || urls.data?.get(r.path)} path={r.path} />
            <Text className="font-sans text-[11px] text-sage-400">{tj('mover.photos.sent')}</Text>
          </View>
        ))}
        {mine.map((q, i) => (
          <View key={q.id} testID={`mover-job-photo-${q.id}`} className="gap-1">
            <View accessible accessibilityRole="image" accessibilityLabel={tj('mover.photos.labelQueued', { n: saved.length + i + 1, total, state: stateText(q) })}>
              <Thumb uri={q.uri} path={q.path} />
            </View>
            <Text className={q.state === 'failed' ? 'font-sans text-[11px] text-danger-on-dark' : 'font-sans text-[11px] text-sage-400'}>{stateText(q)}</Text>
            {q.state === 'failed' ? (
              <View className="gap-0.5">
                {q.problem ? (
                  <Text className="max-w-24 font-sans text-[11px] leading-[14px] text-night-50">
                    {tj(`mover.photos.errors.${q.problem}`, { max: MAX_JOB_PHOTOS_PER_STAGE })}
                  </Text>
                ) : null}
                {q.problem === 'upload_failed' || q.problem === 'refused' ? (
                  <Button testID={`mover-job-photo-${q.id}-retry`} variant="link-dark" size="sm" title={tj('mover.photos.retry')} onPress={() => retryJobPhoto(q.id)} />
                ) : null}
                <Button testID={`mover-job-photo-${q.id}-remove`} variant="link-dark" size="sm" title={tj('mover.photos.remove')} onPress={() => removeJobPhoto(q.id)} />
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <Button
        testID="mover-job-photo-add"
        variant="outline-dark"
        title={tj(Platform.OS === 'web' ? 'mover.photos.add' : 'mover.photos.take')}
        loading={adding}
        disabled={total >= MAX_JOB_PHOTOS_PER_STAGE}
        onPress={() => void take()}
      />
      {problemText ? (
        <View className="gap-1">
          <Text role="alert" className="font-sans text-[13px] text-danger-on-dark">
            {problemText}
          </Text>
          {problem?.key === 'camera_denied' ? (
            <Button variant="link-dark" className="self-start" title={tj('mover.photos.errors.openSettings')} onPress={() => void Linking.openSettings()} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The saved photos of the move, to look at (after the stop). */
export function SavedPhotos({ rows, stage }: { rows: readonly JobPhotoRow[]; stage: JobPhotoStage }) {
  const { t: tj, i18n } = useTranslation('job');
  const locale = resolveLocale(i18n.language);
  const saved = rows.filter((r) => r.stage === stage);
  const urls = usePhotoUrls(saved.map((r) => r.path));
  if (!saved.length) return null;
  return (
    <View testID={`mover-job-saved-${stage}`} className="gap-2">
      <Text className="font-sans-medium text-[14px] text-night-50">{tj(stage === 'pickup' ? 'mover.photos.pickupTitle' : 'mover.photos.dropoffTitle')}</Text>
      <View accessibilityRole="list" className="flex-row flex-wrap gap-2">
        {saved.map((r, i) => (
          <View
            key={r.id}
            accessible
            accessibilityRole="image"
            accessibilityLabel={tj('mover.photos.label', { n: i + 1, total: saved.length, time: formatClockTime(r.taken_at, locale) })}
          >
            <Thumb uri={urls.data?.get(r.path)} path={r.path} />
          </View>
        ))}
      </View>
    </View>
  );
}

const fileIdOf = (path: string) => path.split('/').pop()?.split('.')[0] ?? path;

/** A thumbnail, kept in memory only: the customer's things never stay on the mover's phone. */
function Thumb({ uri, path }: { uri: string | undefined; path: string }) {
  return (
    <View className="h-24 w-24 overflow-hidden rounded-md bg-night-700">
      {uri ? <Image source={{ uri, cacheKey: path }} cachePolicy="memory" contentFit="cover" style={{ width: 96, height: 96 }} accessible={false} /> : null}
    </View>
  );
}
