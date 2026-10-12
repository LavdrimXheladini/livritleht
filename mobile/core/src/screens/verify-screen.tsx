import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { otpCodeSchema, type SelfSignupRole } from '@ranktrip/shared';

import { useAuth } from '../auth-provider';
import { cx } from '../components/cx';
import { Button, Display, TextField, type Tone } from '../components/ui';
import { useAuthErrorText } from './auth-errors';
import { AuthFrame, type OtpSent } from './login-screen';

const schema = z.object({ code: otpCodeSchema });

/** On success the auth session changes and the root layout's guard navigates away. */
export function VerifyScreen({
  sent,
  onBack,
  role,
  tone = 'light',
}: {
  sent: OtpSent;
  onBack: () => void;
  role: SelfSignupRole;
  tone?: Tone;
}) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { supabase } = useAuth();
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  const submit = form.handleSubmit(async ({ code }) => {
    const { error } =
      sent.channel === 'phone'
        ? await supabase.auth.verifyOtp({ phone: sent.target, token: code, type: 'sms' })
        : await supabase.auth.verifyOtp({ email: sent.target, token: code, type: 'email' });
    if (error) form.setError('code', { message: 'wrong_code' });
  });

  const dark = tone === 'dark';
  return (
    <AuthFrame tone={tone} role={role}>
      <View className="gap-2">
        <Display size={38} tone={tone}>
          {t('auth.title')}
        </Display>
        <Text className={cx('font-sans text-base', dark ? 'text-sage-400' : 'text-ink-600')}>
          {t('auth.codeSentTo', { target: sent.target })}
        </Text>
      </View>
      <Controller
        control={form.control}
        name="code"
        render={({ field, fieldState }) => (
          <TextField
            ref={field.ref}
            tone={tone}
            testID="verify-code"
            label={t('auth.codeLabel')}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errorText(fieldState.error?.message)}
          />
        )}
      />
      <Button
        testID="verify-submit"
        variant={dark ? 'accent' : 'primary'}
        title={t('auth.verify')}
        onPress={submit}
        loading={form.formState.isSubmitting}
      />
      <Button variant={dark ? 'link-dark' : 'link'} title={t('auth.changeTarget')} onPress={onBack} />
    </AuthFrame>
  );
}
