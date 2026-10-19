import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, TextField, announce, useAnnouncement } from '@movershub/mobile';
import { CONTACT_CHANGEABLE, MOVE_DAY_CONTACT_NAME_MAX, moveDayContactSchema, type JobRow, type JobStatus, type MoveDayContact } from '@movershub/shared';

import { useJobStep } from '@/lib/jobs';

export type ContactErrors = { phone?: string; name?: string };

/** The phone for the move day as typed, checked: what to send, or what is wrong (texts for the fields). */
export function useContactCheck() {
  const { t: tj } = useTranslation('job');
  return (phone: string, name: string): { contact: MoveDayContact } | { errors: ContactErrors } => {
    if (!phone.trim()) return { errors: { phone: tj('review.phoneRequired') } };
    const parsed = moveDayContactSchema.safeParse({ phone, name });
    if (parsed.success) return { contact: parsed.data };
    const errors: ContactErrors = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'phone') errors.phone ??= tj('review.phoneInvalid');
      if (issue.path[0] === 'name') errors.name ??= issue.message === 'name_too_long' ? tj('review.nameTooLong', { max: MOVE_DAY_CONTACT_NAME_MAX }) : tj('review.nameInvalid');
    }
    return { errors };
  };
}

/** The `job-transition` fields for a checked contact (no name: none sent). */
export const contactFields = (c: MoveDayContact) => ({ contactPhone: c.phone, ...(c.name ? { contactName: c.name } : {}) });

/** The phone for the move day and who to ask for, to type (booking, and changing it later). */
export function ContactFields({
  phone,
  name,
  errors,
  onChange,
  testIDPrefix,
}: {
  phone: string;
  name: string;
  errors: ContactErrors;
  onChange: (phone: string, name: string) => void;
  testIDPrefix: string;
}) {
  const { t: tj } = useTranslation('job');
  return (
    <View className="gap-3">
      <TextField
        testID={`${testIDPrefix}-phone`}
        label={tj('review.phone')}
        hint={tj('review.phoneHint')}
        value={phone}
        onChangeText={(v) => onChange(v, name)}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={24}
      />
      <TextField
        testID={`${testIDPrefix}-name`}
        label={tj('review.askFor')}
        hint={tj('review.askForHint')}
        value={name}
        onChangeText={(v) => onChange(phone, v)}
        error={errors.name}
        autoComplete="name"
        textContentType="name"
        maxLength={MOVE_DAY_CONTACT_NAME_MAX}
      />
    </View>
  );
}

/** While the move is under way: the phone stays as it is (the mover may be calling it). */
const UNDER_WAY: readonly JobStatus[] = ['EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_DROPOFF'];
const CHANGEABLE: readonly JobStatus[] = CONTACT_CHANGEABLE;

/**
 * The phone for the move day on a booked move (design/DECISIONS.md #37; COMPLIANCE §9): what the
 * mover will see, and who sees it; "Change" until the mover is on the way, then kept as it is. Not
 * shown before booking (it is given then) nor once the move is over.
 */
export function MoveDayContactCard({ job, moverName }: { job: JobRow; moverName: string }) {
  const { t } = useTranslation();
  const { t: tj } = useTranslation('job');
  const step = useJobStep();
  const check = useContactCheck();
  const [editing, setEditing] = useState<{ phone: string; name: string } | null>(null);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  useAnnouncement(problem);

  const changeable = CHANGEABLE.includes(job.status);
  if (!changeable && !(UNDER_WAY.includes(job.status) && job.contact_phone)) return null;

  const save = async () => {
    if (!editing) return;
    setProblem(null);
    const checked = check(editing.phone, editing.name);
    if ('errors' in checked) {
      setErrors(checked.errors);
      return;
    }
    const result = await step.mutateAsync({ action: 'contact', jobId: job.id, ...contactFields(checked.contact) });
    if (result.ok) {
      setEditing(null);
      announce(tj('customer.moveDay.saved'));
      return;
    }
    if (result.error === 'invalid_contact') setErrors({ phone: tj('review.phoneInvalid') });
    else if (result.error === 'contact_locked') setProblem(tj('customer.errors.contact_locked'));
    else setProblem(result.error === 'network' ? tj('customer.errors.network') : t('common.errorGeneric'));
  };

  const seen =
    job.status === 'ACCEPTED'
      ? tj('customer.moveDay.seenByMover', { name: moverName })
      : changeable
        ? tj('customer.moveDay.seenOnAccept', { name: moverName })
        : tj('customer.moveDay.locked', { name: moverName });

  return (
    <Card variant="widget" className="gap-2">
      <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
        {tj('customer.moveDay.title')}
      </Text>
      {editing ? (
        <>
          <ContactFields
            phone={editing.phone}
            name={editing.name}
            errors={errors}
            testIDPrefix="move-contact"
            onChange={(phone, name) => {
              setEditing({ phone, name });
              setErrors({});
            }}
          />
          <View className="flex-row flex-wrap gap-2">
            <Button testID="move-contact-save" size="md" title={tj('customer.moveDay.save')} loading={step.isPending} onPress={() => void save()} />
            <Button
              variant="outline"
              size="md"
              title={tj('customer.moveDay.keep')}
              disabled={step.isPending}
              onPress={() => {
                setEditing(null);
                setErrors({});
                setProblem(null);
              }}
            />
          </View>
        </>
      ) : (
        <>
          {job.contact_phone ? (
            <View testID="move-contact" className="gap-0.5">
              <Text selectable className="font-sans-medium text-[15px] text-ink-900">
                {job.contact_phone}
              </Text>
              {job.contact_name ? (
                <Text className="font-sans text-[13.5px] text-ink-700">{tj('customer.moveDay.askFor', { name: job.contact_name })}</Text>
              ) : null}
            </View>
          ) : (
            <Text testID="move-contact-none" className="font-sans text-[13.5px] text-ink-700">
              {tj('customer.moveDay.none')}
            </Text>
          )}
          <Text testID="move-contact-seen" className="font-sans text-[12.5px] leading-[18px] text-ink-600">
            {seen}
          </Text>
          {changeable ? (
            <Button
              testID="move-contact-change"
              variant="link"
              className="-ml-2 self-start"
              title={job.contact_phone ? tj('customer.moveDay.change') : tj('customer.moveDay.add')}
              onPress={() => {
                setProblem(null);
                setEditing({ phone: job.contact_phone ?? '', name: job.contact_name ?? '' });
              }}
            />
          ) : null}
        </>
      )}
      {problem ? (
        <Text role="alert" className="font-sans text-[13px] text-danger">
          {problem}
        </Text>
      ) : null}
    </Card>
  );
}
