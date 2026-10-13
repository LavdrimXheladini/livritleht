import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { otpCodeSchema } from '@movershub/shared';

import { useAuth } from '../auth-provider';
import { Button, TextField } from '../components/ui';
import type { PendingSignIn } from '../pending-sign-in';
import { useAuthErrorText } from './auth-errors';
import { AuthFrame, AuthTitle } from './auth-screen';

const schema = z.object({ code: otpCodeSchema });

/**
 * The code from the email. A neutral title: whether the account already existed is known only
 * after the code. On success the auth session changes and the root layout opens the home screen.
 */
export function VerifyScreen({ sent, onBack }: { sent: PendingSignIn; onBack: () => void }) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { supabase } = useAuth();
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  const submit = form.handleSubmit(async ({ code }) => {
    const { error } = await supabase.auth.verifyOtp({ email: sent.email, token: code, type: 'email' });
    if (error) form.setError('code', { message: 'wrong_code' });
  });

  return (
    <AuthFrame>
      <View className="gap-2">
        <AuthTitle>{t('auth.verifyTitle')}</AuthTitle>
        <Text className="font-sans text-base text-ink-600">{t('auth.codeSentTo', { target: sent.email })}</Text>
      </View>
      <Controller
        control={form.control}
        name="code"
        render={({ field, fieldState }) => (
          <TextField
            ref={field.ref}
            testID="verify-code"
            label={t('auth.codeLabel')}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={submit}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errorText(fieldState.error?.message)}
          />
        )}
      />
      <Button testID="verify-submit" variant="primary" title={t('auth.verify')} onPress={submit} loading={form.formState.isSubmitting} />
      <Button testID="verify-change-email" variant="link" title={t('auth.changeEmail')} onPress={onBack} />
    </AuthFrame>
  );
}
