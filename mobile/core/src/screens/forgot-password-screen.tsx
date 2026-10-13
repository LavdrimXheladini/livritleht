import { zodResolver } from '@hookform/resolvers/zod';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { emailSchema } from '@movershub/shared';

import { useAuth } from '../auth-provider';
import { Button } from '../components/ui';
import { adoptDraftEmail, getDraftEmail, type PendingSignIn } from '../pending-sign-in';
import { useAuthErrorText } from './auth-errors';
import { AuthFrame, AuthTitle, EmailInput, useAttemptAnnouncement } from './auth-screen';

const schema = z.object({ email: emailSchema });

/**
 * "Forgot password?": a 6-digit code by email, then a new password (the app asks for it right after
 * the code). Its own screen, so Back returns to sign in. Every address gets the same answer.
 */
export function ForgotPasswordScreen({ onCodeSent, onBack }: { onCodeSent: (sent: PendingSignIn) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { supabase } = useAuth();
  const say = useAttemptAnnouncement();
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: getDraftEmail() },
  });
  const rootText = errorText(form.formState.errors.root?.message);

  const submit = form.handleSubmit(
    async ({ email }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      // Supabase Auth answers "sent" for an address without an account before it tries to send
      // anything; every other answer concerns an existing account. So only "no answer at all" and the
      // limit per network (the same for every address) are shown; anything else looks sent.
      if (error && (isAuthRetryableFetchError(error) || error.code === 'over_request_rate_limit')) {
        const key = error.status === 429 ? 'too_many_attempts' : 'generic';
        form.setError('root', { message: key });
        say(errorText(key) ?? '');
        return;
      }
      onCodeSent({ email, purpose: 'recovery', role: null });
    },
    (errors) => say(errorText(errors.email?.message) ?? ''),
  );

  return (
    <AuthFrame>
      <View className="gap-2">
        <AuthTitle>{t('auth.forgotTitle')}</AuthTitle>
        <Text className="font-sans text-base text-ink-600">{t('auth.forgotSubtitle')}</Text>
      </View>
      <View className="gap-4">
        <EmailInput
          control={form.control}
          name="email"
          testID="forgot-email"
          returnKeyType="send"
          onSubmitEditing={submit}
          onEmailChange={adoptDraftEmail}
        />
        {rootText ? <Text className="font-sans text-sm text-danger">{rootText}</Text> : null}
        <Button testID="forgot-send-code" variant="primary" title={t('auth.sendCode')} onPress={submit} loading={form.formState.isSubmitting} />
        <Button testID="forgot-back" variant="link" className="self-center" title={t('auth.backToSignIn')} onPress={onBack} />
      </View>
    </AuthFrame>
  );
}
