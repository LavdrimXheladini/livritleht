import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { emailSchema, phoneSchema, type SelfSignupRole, type SignupMetadata } from '@movershub/shared';

import { useAnnouncement } from '../a11y';
import { useAuth } from '../auth-provider';
import { cx } from '../components/cx';
import { Button, Display, SegmentedControl, TextField, Wordmark, type Tone } from '../components/ui';
import { currentLocale } from '../i18n';
import { useAuthErrorText } from './auth-errors';

export type OtpChannel = 'phone' | 'email';
export type OtpSent = { channel: OtpChannel; target: string };

export function LoginScreen({
  role,
  onCodeSent,
  onClose,
  tone = 'light',
}: {
  /** Role created on first sign-up. Each app passes its own; `admin` is impossible. */
  role: SelfSignupRole;
  onCodeSent: (sent: OtpSent) => void;
  /** Shows "Back": sign-in is optional until the customer books. */
  onClose?: () => void;
  tone?: Tone;
}) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState<OtpChannel>('phone');
  const dark = tone === 'dark';

  return (
    <AuthFrame tone={tone} role={role} onClose={onClose}>
      <View className="gap-2">
        <Display size={38} tone={tone}>
          {t('auth.title')}
        </Display>
        <Text className={cx('font-sans text-base', dark ? 'text-sage-400' : 'text-ink-600')}>{t('auth.subtitle')}</Text>
      </View>
      <SegmentedControl
        tone={tone}
        value={channel}
        onChange={setChannel}
        options={[
          { value: 'phone', label: t('auth.usePhone') },
          { value: 'email', label: t('auth.useEmail') },
        ]}
      />
      {/* key remounts the form so the resolver matches the channel */}
      <RequestForm key={channel} channel={channel} role={role} onCodeSent={onCodeSent} tone={tone} />
    </AuthFrame>
  );
}

/** Shared frame of the sign-in screens: wordmark on top, form in the middle, keyboard-aware. */
export function AuthFrame({
  tone,
  role,
  onClose,
  children,
}: {
  tone: Tone;
  role: SelfSignupRole;
  onClose?: (() => void) | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <SafeAreaView className={cx('flex-1', tone === 'dark' ? 'bg-night-900' : 'bg-stone-100')}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 px-4">
        <View className="min-h-14 flex-row items-center justify-between">
          <Wordmark tone={tone} partner={role === 'mover' ? t('common.partner') : undefined} />
          {onClose ? (
            <Button variant={tone === 'dark' ? 'link-dark' : 'link'} title={t('common.back')} onPress={onClose} />
          ) : null}
        </View>
        <View className="flex-1 justify-center gap-6 pb-10">{children}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RequestForm({
  channel,
  role,
  onCodeSent,
  tone,
}: {
  channel: OtpChannel;
  role: SelfSignupRole;
  onCodeSent: (sent: OtpSent) => void;
  tone: Tone;
}) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { supabase } = useAuth();
  const schema = z.object({ target: channel === 'phone' ? phoneSchema : emailSchema });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { target: '' },
  });

  const rootError = form.formState.errors.root ? t('common.errorGeneric') : null;
  useAnnouncement(rootError);

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
            ref={field.ref}
            tone={tone}
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
      {rootError ? (
        <Text className={cx('font-sans text-sm', tone === 'dark' ? 'text-danger-on-dark' : 'text-danger')}>{rootError}</Text>
      ) : null}
      <Button
        testID="login-send-code"
        variant={tone === 'dark' ? 'accent' : 'primary'}
        title={t('auth.sendCode')}
        onPress={submit}
        loading={form.formState.isSubmitting}
      />
    </View>
  );
}
