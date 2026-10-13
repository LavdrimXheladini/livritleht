import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { otpCodeSchema } from '@movershub/shared';

import { useAuth } from '../auth-provider';
import { Button, TextField } from '../components/ui';
import { owePassword, settlePassword } from '../password';
import type { PendingSignIn } from '../pending-sign-in';
import { useAuthErrorText } from './auth-errors';
import { AuthFrame, AuthTitle } from './auth-screen';

const schema = z.object({ code: otpCodeSchema });

/**
 * The code from the email: to confirm a new account (the only time a code is needed to get in), or
 * after "Forgot password?" to set a new one. A neutral title: whether the account already existed is
 * known only after the code. On success the auth session changes and the root layout opens home,
 * which asks for the password first.
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
    const type = sent.purpose === 'recovery' ? 'recovery' : 'email';
    // Owed before the sign-in happens: also if the app closes before the password is chosen, and in
    // other tabs of the browser version, which hear about the sign-in.
    await owePassword(sent.email, sent.purpose);
    const { error } = await supabase.auth.verifyOtp({ email: sent.email, token: code, type });
    if (error) {
      await settlePassword();
      form.setError('code', { message: 'wrong_code' });
    }
  });

  return (
    <AuthFrame>
      <View className="gap-2">
        <AuthTitle>{t('auth.verifyTitle')}</AuthTitle>
        <Text className="font-sans text-base text-ink-600">
          {sent.purpose === 'recovery'
            ? t('auth.recoveryCodeSentTo', { target: sent.email })
            : t('auth.codeSentTo', { target: sent.email })}
        </Text>
        {sent.purpose === 'recovery' ? (
          <Text className="font-sans text-sm text-ink-600">{t('auth.recoveryNoCode')}</Text>
        ) : null}
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
