import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button, Card, currentLocale, formatClockTime } from '@movershub/mobile';
import { JOB_PHOTO_STAGES, type JobPhotoRow, type JobPhotoStage } from '@movershub/shared';

import { usePhotoUrls } from '@/lib/job-photos';

const SHOWN = 6;

/**
 * The photos the mover added of the customer's things at the pickup and the drop-off (design/DECISIONS.md
 * #36; COMPLIANCE §7): evidence kept with the move if something is damaged or missing. Each opens larger.
 */
export function MovePhotos({
  rows,
  moverName,
  failed = false,
  onRetry,
}: {
  rows: readonly JobPhotoRow[];
  moverName: string;
  /** The photos couldn't be read (not: there are none). */
  failed?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const { t: tj } = useTranslation('job');
  const urls = usePhotoUrls(rows.map((r) => r.path));
  const [open, setOpen] = useState<JobPhotoRow | null>(null);
  return (
    <Card variant="widget" className="gap-3">
      <View testID="move-photos" className="gap-3">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {tj('customer.photos.title')}
        </Text>
        <Text className="font-sans text-[13px] leading-[19px] text-ink-600">{tj('customer.photos.note', { name: moverName })}</Text>
        {failed ? (
          <View className="items-start gap-2">
            <Text role="alert" className="font-sans text-[13.5px] text-ink-700">
              {tj('customer.photos.listFailed')}
            </Text>
            {onRetry ? <Button variant="outline" size="md" title={t('common.retry')} onPress={onRetry} /> : null}
          </View>
        ) : rows.length === 0 ? (
          <Text className="font-sans text-[13.5px] text-ink-700">{tj('customer.photos.none')}</Text>
        ) : null}
        {JOB_PHOTO_STAGES.map((stage) => (
          <StagePhotos key={stage} stage={stage} rows={rows.filter((r) => r.stage === stage)} urls={urls.data} onOpen={setOpen} />
        ))}
      </View>
      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View testID="move-photo-viewer" className="flex-1 gap-3 bg-ink-900/95 px-4 pb-8 pt-12">
          <Button variant="secondary" size="md" className="self-end" title={t('common.close')} onPress={() => setOpen(null)} />
          {open ? <Large uri={urls.data?.get(open.path)} path={open.path} onReload={() => void urls.refetch()} /> : null}
        </View>
      </Modal>
    </Card>
  );
}

function StagePhotos({
  stage,
  rows,
  urls,
  onOpen,
}: {
  stage: JobPhotoStage;
  rows: readonly JobPhotoRow[];
  urls: Map<string, string> | undefined;
  onOpen: (row: JobPhotoRow) => void;
}) {
  const { t: tj } = useTranslation('job');
  const locale = currentLocale();
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const stop = tj(stage === 'pickup' ? 'customer.photos.pickup' : 'customer.photos.dropoff');
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <View testID={`move-photos-${stage}`} className="gap-2">
      <Text className="font-sans-medium text-[13.5px] text-ink-900">{stop}</Text>
      <View accessibilityRole="list" className="flex-row flex-wrap gap-2">
        {shown.map((r, i) => (
          <Pressable
            key={r.id}
            testID={`move-photo-${stage}-${i + 1}`}
            accessibilityRole="button"
            accessibilityLabel={tj('customer.photos.label', { n: i + 1, total: rows.length, stop, time: formatClockTime(r.taken_at, locale) })}
            accessibilityHint={tj('customer.photos.openHint')}
            onPress={() => onOpen(r)}
            className="h-24 w-24 overflow-hidden rounded-md bg-stone-200"
          >
            {urls?.get(r.path) ? (
              <Image source={{ uri: urls.get(r.path), cacheKey: r.path }} cachePolicy="memory" contentFit="cover" style={{ width: 96, height: 96 }} accessible={false} />
            ) : null}
          </Pressable>
        ))}
      </View>
      {!all && rows.length > SHOWN ? (
        <Button variant="link" size="sm" className="-ml-2 self-start" title={tj('customer.photos.showAll', { count: rows.length })} onPress={() => setAll(true)} />
      ) : null}
    </View>
  );
}

/** The photo large; if it can't be loaded (e.g. its link ran out), a new link and another try. */
function Large({ uri, path, onReload }: { uri: string | undefined; path: string; onReload: () => void }) {
  const { t } = useTranslation();
  const { t: tj } = useTranslation('job');
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (!uri || failedUri === uri) {
    return (
      <View className="items-start gap-3">
        <Text className="font-sans text-sm text-stone-50">{tj('customer.photos.loadFailed')}</Text>
        <Button variant="secondary" size="md" title={t('common.retry')} onPress={onReload} />
      </View>
    );
  }
  return (
    <Image source={{ uri, cacheKey: path }} cachePolicy="memory" contentFit="contain" style={{ flex: 1 }} onError={() => setFailedUri(uri)} accessible={false} />
  );
}
