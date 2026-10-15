import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import {
  CROSS_BORDER_DOCUMENTS,
  DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  documentMimeType,
  documentNeedsExpiry,
  documentStatus,
  expiryError,
  formatExpiryDate,
  parseExpiryDate,
  requiredDocuments,
  type DocumentStatus,
  type DocumentType,
  type MoverDocumentRow,
} from '@movershub/shared';
import { Button, DarkPanel, Display, Pill, Screen, TextField, announce, useAnnouncement, type PillTone } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { useMoverCompany } from '@/lib/mover-company';
import { useMoverDocuments, useUploadDocument, type ChosenFile } from '@/lib/mover-documents';

const STATUS_TONE: Record<DocumentStatus, PillTone> = {
  missing: 'accent',
  checking: 'dark-muted',
  verified: 'dark',
  expiring: 'accent',
  expired: 'accent',
};

type Problem = 'file_too_large' | 'file_type' | 'camera_denied' | 'upload_failed' | 'expiry_required' | 'expiry_invalid' | 'expiry_past';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function BackLink() {
  const { t } = useTranslation();
  return <Button testID="documents-back" variant="link-dark" className="self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={goBack} />;
}

/** "1.2 MB" / "350 KB". */
const fileSize = (bytes: number | null) => (bytes === null ? '' : bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

const today = () => new Date().toISOString().slice(0, 10);

/**
 * "Your documents" (mover side, setup step 2 — COMPLIANCE §5, design/DECISIONS.md #20): the company
 * register extract (a private person: an ID document) and the carrier's liability insurance; for
 * cross-border jobs the CMR insurance and the EU operator licence. Files go to a private bucket that
 * only the company's owner and MoversHub's checks can read; a new upload replaces the current one
 * and is checked again.
 */
export function DocumentsScreen() {
  const { t } = useTranslation();
  const company = useMoverCompany();
  const documents = useMoverDocuments(company.data?.id);

  const loading = company.isPending || (company.data !== null && company.data !== undefined && documents.isPending);
  const failed = company.isError || documents.isError;

  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      <BackLink />
      <View className="gap-2">
        <Display tone="dark">{t('mover.documents.title')}</Display>
        <Text className="font-sans text-[15px] leading-[22px] text-sage-400">{t('mover.documents.subtitle')}</Text>
      </View>

      {failed ? (
        <View className="gap-3">
          <Text className="font-sans text-base text-night-50">{t('common.errorGeneric')}</Text>
          <Button
            testID="documents-retry"
            variant="accent"
            title={t('common.retry')}
            onPress={() => {
              void company.refetch();
              void documents.refetch();
            }}
          />
        </View>
      ) : loading ? (
        <ActivityIndicator color={colors.accent[300]} accessibilityLabel={t('common.loading')} />
      ) : company.data === null || company.data === undefined ? (
        <DarkPanel className="gap-3">
          <Text className="font-sans text-sm leading-5 text-night-50">{t('mover.documents.needCompany')}</Text>
          <Button testID="documents-company" variant="accent" size="md" title={t('mover.documents.goToCompany')} onPress={() => router.replace('/mover/company')} />
        </DarkPanel>
      ) : (
        <>
          <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{t('mover.documents.privacy')}</Text>
          <Section title={t('mover.documents.requiredTitle')}>
            {requiredDocuments(company.data.is_business).map((type) => (
              <DocumentCard key={type} companyId={company.data!.id} type={type} row={documents.data?.find((d) => d.type === type)} />
            ))}
          </Section>
          <Section title={t('mover.documents.crossBorderTitle')} text={t('mover.documents.crossBorderText')}>
            {CROSS_BORDER_DOCUMENTS.map((type) => (
              <DocumentCard key={type} companyId={company.data!.id} type={type} row={documents.data?.find((d) => d.type === type)} optional />
            ))}
          </Section>
        </>
      )}
    </Screen>
  );
}

function Section({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
          {title}
        </Text>
        {text ? <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{text}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function DocumentCard({
  companyId,
  type,
  row,
  optional = false,
}: {
  companyId: string;
  type: DocumentType;
  row: MoverDocumentRow | undefined;
  /** Cross-border documents: not having one is fine. */
  optional?: boolean;
}) {
  const { t } = useTranslation();
  const upload = useUploadDocument(companyId);
  const status = documentStatus(row, new Date());
  const notNeeded = optional && status === 'missing';
  const [file, setFile] = useState<ChosenFile | null>(null);
  const [expiry, setExpiry] = useState('');
  const [problem, setProblem] = useState<{ key: Problem; attempt: number } | null>(null);
  const problemText = problem ? t(`mover.documents.errors.${problem.key}`) : undefined;
  useAnnouncement(problemText, problem?.attempt);
  const fail = (key: Problem) => setProblem((p) => ({ key, attempt: (p?.attempt ?? 0) + 1 }));

  const take = (chosen: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }) => {
    const mime = documentMimeType(chosen.mimeType, chosen.name);
    if (!mime) return fail('file_type');
    if (chosen.size && chosen.size > MAX_DOCUMENT_BYTES) return fail('file_too_large');
    setProblem(null);
    setFile({ uri: chosen.uri, name: chosen.name ?? t(`mover.documents.types.${type}.title`), mime, size: chosen.size ?? null });
  };

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: [...DOCUMENT_MIME_TYPES], copyToCacheDirectory: true, multiple: false });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) take({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size });
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return fail('camera_denied');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) take({ uri: asset.uri, name: asset.fileName ?? 'photo.jpg', mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize ?? null });
  };

  const save = async () => {
    if (!file) return;
    const dateProblem = expiryError(type, expiry, today());
    if (dateProblem) return fail(dateProblem);
    try {
      await upload.mutateAsync({ type, file, expiresOn: documentNeedsExpiry(type) ? parseExpiryDate(expiry) : null, current: row });
    } catch (e) {
      const message = (e as { message?: string } | null)?.message ?? '';
      if (/exceeded the maximum allowed size|payload too large/i.test(message)) return fail('file_too_large');
      if (/mime type|invalid_mime_type/i.test(message)) return fail('file_type');
      if (message.includes('document_expired')) return fail('expiry_past');
      return fail('upload_failed');
    }
    setFile(null);
    setExpiry('');
    setProblem(null);
    announce(t('mover.documents.saved'));
  };

  return (
    <View testID={`document-${type}`} className="gap-3 rounded-panel border border-night-600 bg-night-800 p-3.5">
      <View accessible className="flex-row items-start gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-sans-semibold text-[15px] text-night-50">{t(`mover.documents.types.${type}.title`)}</Text>
          <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{t(`mover.documents.types.${type}.text`)}</Text>
          {row?.expires_at ? (
            <Text className="font-sans text-[13px] text-night-50">{t('mover.documents.validUntil', { date: formatExpiryDate(row.expires_at) })}</Text>
          ) : null}
        </View>
        <Pill tone={notNeeded ? 'dark-muted' : STATUS_TONE[status]} size="sm">
          {notNeeded ? t('mover.documents.status.optional') : t(`mover.documents.status.${status}`)}
        </Pill>
      </View>

      {file ? (
        <View className="gap-3">
          <Text testID={`document-${type}-file`} className="font-sans text-sm text-night-50">
            {[file.name, fileSize(file.size)].filter(Boolean).join(' · ')}
          </Text>
          {documentNeedsExpiry(type) ? (
            <TextField
              testID={`document-${type}-expiry`}
              tone="dark"
              announceError={false}
              label={t('mover.documents.expiry')}
              hint={t('mover.documents.expiryHint')}
              value={expiry}
              onChangeText={setExpiry}
              keyboardType="numbers-and-punctuation"
              placeholder="31.12.2027"
              error={problem && problem.key.startsWith('expiry_') ? problemText : undefined}
            />
          ) : null}
          <Button testID={`document-${type}-save`} variant="accent" size="md" title={t('mover.documents.save')} loading={upload.isPending} onPress={() => void save()} />
          <Button
            variant="link-dark"
            className="self-start"
            title={t('mover.documents.cancel')}
            disabled={upload.isPending}
            onPress={() => {
              setFile(null);
              setProblem(null);
            }}
          />
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {Platform.OS === 'web' ? null : (
            <Button testID={`document-${type}-photo`} variant="outline-dark" size="md" title={t('mover.documents.takePhoto')} onPress={() => void takePhoto()} />
          )}
          <Button
            testID={`document-${type}-choose`}
            variant="outline-dark"
            size="md"
            title={row ? t('mover.documents.replace') : t('mover.documents.chooseFile')}
            onPress={() => void chooseFile()}
          />
        </View>
      )}

      {problem && !problem.key.startsWith('expiry_') ? (
        <Text testID={`document-${type}-problem`} className="font-sans text-[13px] text-danger-on-dark">
          {problemText}
        </Text>
      ) : null}
    </View>
  );
}
