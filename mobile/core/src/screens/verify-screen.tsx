import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { z } from 'zod';

import { otpCodeSchema } from '@ranktrip/shared';

import { useAuth } from '../auth-provider';
import { Button, TextField } from '../components/ui';
import { useAuthErrorText } from './auth-errors';
import type { OtpSent } from './login-screen';

const schema = z.object({ code: otpCodeSchema });

/** On success the auth session changes and the root layout's guard navigates away. */
export function VerifyScreen({ sent, onBack }: { sent: OtpSent; onBack: () => void }) {
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 justify-center gap-6 bg-white px-4"
    >
      <View className="gap-1">
        <Text className="text-2xl font-bold text-ink-900">{t('auth.title')}</Text>
        <Text className="text-base text-ink-700">{t('auth.codeSentTo', { target: sent.target })}</Text>
      </View>
      <Controller
        control={form.control}
        name="code"
        render={({ field, fieldState }) => (
          <TextField
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
      <Button testID="verify-submit" title={t('auth.verify')} onPress={submit} loading={form.formState.isSubmitting} />
      <Button variant="link" title={t('auth.changeTarget')} onPress={onBack} />
    </KeyboardAvoidingView>
  );
}
