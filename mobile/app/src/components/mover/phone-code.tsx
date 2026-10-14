import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { phoneSchema } from '@movershub/shared';
import { Button, CheckIcon, ChipGroup, TextField, currentLocale, useAnnouncement } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { useConfirmedPhones, usePhoneCodes, type PhoneChannel } from '@/lib/company-checks';

type Problem = 'phone_code_wrong' | 'phone_codes_unavailable' | 'phone_too_many' | 'phone_invalid' | 'phone_send_failed' | 'phone_check_failed';

/** Confirmed numbers show this instead of the code steps. */
export function PhoneConfirmed() {
  const { t } = useTranslation();
  return (
    <View testID="company-phone-confirmed" accessible className="flex-row items-center gap-2">
      <CheckIcon size={16} color={colors.accent[300]} />
      <Text className="font-sans-medium text-sm text-night-50">{t('mover.company.phoneConfirmed')}</Text>
    </View>
  );
}

/**
 * Under the phone field: the number is proven with a 6-digit code by SMS or WhatsApp (`phone-verification`
 * function). Nothing shows until a full number with country code is typed; a number this account
 * confirmed before shows as confirmed. Postgres accepts the company's phone only once it is confirmed.
 */
export function PhoneCode({ phone }: { phone: string }) {
  const { t } = useTranslation();
  const confirmed = useConfirmedPhones();
  const codes = usePhoneCodes();
  const parsed = phoneSchema.safeParse(phone);
  const number = parsed.success ? parsed.data : null;
  const [channel, setChannel] = useState<PhoneChannel>('sms');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'check' | null>(null);
  const [problem, setProblem] = useState<{ key: Problem; attempt: number } | null>(null);
  const problemText = problem ? t(`mover.company.errors.${problem.key}`) : undefined;
  useAnnouncement(problemText, problem?.attempt);

  if (!number || confirmed.isPending) return null;
  if (confirmed.data?.includes(number)) return <PhoneConfirmed />;

  const fail = (key: Problem) => setProblem((p) => ({ key, attempt: (p?.attempt ?? 0) + 1 }));

  const send = async () => {
    setBusy('send');
    setProblem(null);
    const answer = await codes.send(number, channel, currentLocale());
    setBusy(null);
    if (answer.ok) {
      setSentTo(number);
      setCode('');
      return;
    }
    fail(
      answer.error === 'codes_unavailable'
        ? 'phone_codes_unavailable'
        : answer.error === 'rate_limited'
          ? 'phone_too_many'
          : answer.error === 'invalid_phone'
            ? 'phone_invalid'
            : 'phone_send_failed',
    );
  };

  const check = async () => {
    if (!/^\d{4,10}$/.test(code.trim())) return fail('phone_code_wrong');
    setBusy('check');
    setProblem(null);
    const answer = await codes.check(number, code.trim());
    setBusy(null);
    if (answer.ok) {
      if (answer.data.status !== 'approved') fail('phone_code_wrong');
      return;
    }
    fail(answer.error === 'rate_limited' ? 'phone_too_many' : answer.error === 'codes_unavailable' ? 'phone_codes_unavailable' : 'phone_check_failed');
  };

  const waitingForCode = sentTo === number;
  return (
    <View className="gap-3 rounded-panel border border-night-600 bg-night-800 p-3.5">
      {waitingForCode ? (
        <>
          <Text className="font-sans text-sm leading-5 text-night-50">{t('mover.company.codeSent', { phone: number })}</Text>
          <TextField
            testID="company-phone-code"
            tone="dark"
            announceError={false}
            label={t('mover.company.code')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={10}
            error={problem?.key === 'phone_code_wrong' ? problemText : undefined}
            onSubmitEditing={() => void check()}
          />
          <Button testID="company-phone-confirm" variant="accent" size="md" title={t('mover.company.confirmCode')} loading={busy === 'check'} onPress={() => void check()} />
          <Button
            testID="company-phone-resend"
            variant="link-dark"
            className="self-start"
            title={t('mover.company.sendAgain')}
            disabled={busy !== null}
            onPress={() => setSentTo(null)}
          />
        </>
      ) : (
        <>
          <ChipGroup
            variant="dark-pill"
            label={t('mover.company.phoneSendBy')}
            accessibilityLabel={t('mover.company.phoneSendBy')}
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'sms', label: t('mover.company.channelSms') },
              { value: 'whatsapp', label: t('mover.company.channelWhatsapp') },
            ]}
          />
          <Button testID="company-phone-send" variant="outline-dark" size="md" title={t('mover.company.sendCode')} loading={busy === 'send'} onPress={() => void send()} />
        </>
      )}
      {problem && problem.key !== 'phone_code_wrong' ? (
        <Text testID="company-phone-problem" className="font-sans text-[13px] text-danger-on-dark">
          {problemText}
        </Text>
      ) : null}
    </View>
  );
}
