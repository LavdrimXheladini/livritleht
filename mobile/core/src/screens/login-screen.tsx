import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { z } from 'zod';

import { emailSchema, phoneSchema, type SelfSignupRole, type SignupMetadata } from '@ranktrip/shared';

import { useAuth } from '../auth-provider';
import { Button, SegmentedControl, TextField } from '../components/ui';
import { currentLocale } from '../i18n';
import { useAuthErrorText } from './auth-errors';

export type OtpChannel = 'phone' | 'email';
export type OtpSent = { channel: OtpChannel; target: string };

export function LoginScreen({
  role,
  onCodeSent,
}: {
  /** Role created on first sign-up. Each app passes its own; `admin` is impossible. */
  role: SelfSignupRole;
  onCodeSent: (sent: OtpSent) => void;
}) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState<OtpChannel>('phone');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 justify-center gap-6 bg-white px-4"
    >
      <View className="gap-1">
        <Text className="text-2xl font-bold text-ink-900">{t('auth.title')}</Text>
        <Text className="text-base text-ink-500">{t('auth.subtitle')}</Text>
      </View>
      <SegmentedControl
        value={channel}
        onChange={setChannel}
        options={[
          { value: 'phone', label: t('auth.usePhone') },
          { value: 'email', label: t('auth.useEmail') },
        ]}
      />
      {/* key remounts the form so the resolver matches the channel */}
      <RequestForm key={channel} channel={channel} role={role} onCodeSent={onCodeSent} />
    </KeyboardAvoidingView>
  );
}

function RequestForm({
  channel,
  role,
  onCodeSent,
}: {
  channel: OtpChannel;
  role: SelfSignupRole;
  onCodeSent: (sent: OtpSent) => void;
}) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { supabase } = useAuth();
  const schema = z.object({ target: channel === 'phone' ? phoneSchema : emailSchema });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { target: '' },
  });

  const submit = form.handleSubmit(async ({ target }) => {
    const data: SignupMetadata = { role, locale: currentLocale() };
    const { error } =
      channel === 'phone'
        ? await supabase.auth.signInWithOtp({ phone: target, options: { data } })
        : await supabase.auth.signInWithOtp({ email: target, options: { data } });
    if (error) {
      form.setError('root', { message: error.message });
      return;
    }
    onCodeSent({ channel, target });
  });

  return (
    <View className="gap-4">
      <Controller
        control={form.control}
        name="target"
        render={({ field, fieldState }) => (
          <TextField
            testID="login-target"
            label={channel === 'phone' ? t('auth.phoneLabel') : t('auth.emailLabel')}
            placeholder={channel === 'phone' ? t('auth.phonePlaceholder') : t('auth.emailPlaceholder')}
            keyboardType={channel === 'phone' ? 'phone-pad' : 'email-address'}
            autoComplete={channel === 'phone' ? 'tel' : 'email'}
            autoCapitalize="none"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errorText(fieldState.error?.message)}
          />
        )}
      />
      {form.formState.errors.root ? (
        <Text className="text-sm text-danger">{t('common.errorGeneric')}</Text>
      ) : null}
      <Button
        testID="login-send-code"
        title={t('auth.sendCode')}
        onPress={submit}
        loading={form.formState.isSubmitting}
      />
    </View>
  );
}
