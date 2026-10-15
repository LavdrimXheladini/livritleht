import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, DarkPanel, WarningIcon } from '@movershub/mobile';
import { formatExpiryDate, latestReminders, reminderConsequence, type ReminderRow } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { useDismissReminders, useReminders } from '@/lib/reminders';

/**
 * Reminders on the mover's home (COMPLIANCE §5; design/DECISIONS.md #30): a document ending in 30, 14
 * or 3 days, or ended — the latest per document, with what it means (no bookings, no moves across a
 * border, the account check) and the way to upload the new one. "Got it" puts it away until the next
 * stage. The checklist keeps showing where each document stands.
 */
export function Reminders() {
  const { t } = useTranslation();
  const reminders = useReminders();
  const dismiss = useDismissReminders();
  const rows = reminders.data ?? [];
  const shown = latestReminders(rows);
  if (shown.length === 0) return null;
  return (
    <View testID="reminders" className="gap-3">
      <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
        {t('mover.reminders.title')}
      </Text>
      {shown.map((reminder) => (
        <Reminder
          key={reminder.document_id}
          reminder={reminder}
          busy={dismiss.isPending}
          onDismiss={() => dismiss.mutate(rows.filter((r) => r.document_id === reminder.document_id).map((r) => r.id))}
        />
      ))}
      {dismiss.isError ? <Text className="font-sans text-[13px] text-danger-on-dark">{t('common.errorGeneric')}</Text> : null}
    </View>
  );
}

function Reminder({ reminder, busy, onDismiss }: { reminder: ReminderRow; busy: boolean; onDismiss: () => void }) {
  const { t } = useTranslation();
  const ended = reminder.kind === 'document_ended';
  const date = formatExpiryDate(reminder.expires_at);
  const what = reminderConsequence(reminder.document_type);
  return (
    <DarkPanel className="gap-3">
      <View testID={`reminder-${reminder.document_type}`} accessible className="flex-row items-start gap-3">
        <WarningIcon size={18} color={ended ? colors['danger-on-dark'] : colors.accent[300]} />
        <View className="flex-1 gap-1">
          <Text className="font-sans-semibold text-[15px] text-night-50">{t(`mover.documents.types.${reminder.document_type}.title`)}</Text>
          <Text className="font-sans text-[13.5px] leading-5 text-night-50">
            {ended ? t('mover.reminders.endedOn', { date }) : t('mover.reminders.endsOn', { date })}{' '}
            {ended ? t(`mover.reminders.endedWhat.${what}`) : t(`mover.reminders.endingWhat.${what}`)}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          testID={`reminder-${reminder.document_type}-upload`}
          variant="accent"
          size="sm"
          title={t('mover.reminders.upload')}
          onPress={() => router.push('/mover/documents')}
        />
        <Button testID={`reminder-${reminder.document_type}-dismiss`} variant="link-dark" title={t('mover.reminders.dismiss')} loading={busy} onPress={onDismiss} />
      </View>
    </DarkPanel>
  );
}
