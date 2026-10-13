import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { emailSchema, type SelfSignupRole, type SignupMetadata } from '@movershub/shared';

import { useAnnouncement } from '../a11y';
import { useAuth } from '../auth-provider';
import { Button, Display, SegmentedControl, TextField, Wordmark } from '../components/ui';
import { currentLocale } from '../i18n';
import type { AuthMode, PendingSignIn } from '../pending-sign-in';
import { useAuthErrorText } from './auth-errors';
import { RoleChoice } from './role-choice';

/**
 * The app's first screen when signed out: sign in, or create an account as a customer or a mover.
 * Both send a 6-digit code by email, and every email gets the same answer — the screen never tells
 * anyone whether an address has an account. The role picked here is saved only after the code has
 * proven the email (`public.choose_role`); an account without a role is asked after signing in.
 */
export function AuthScreen({ onCodeSent }: { onCodeSent: (sent: PendingSignIn) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>('login');
  // The typed address survives switching between the two tabs.
  const [email, setEmail] = useState('');

  return (
    <AuthFrame>
      <View className="gap-2">
        <AuthTitle>{mode === 'login' ? t('auth.title') : t('auth.registerTitle')}</AuthTitle>
        <Text className="font-sans text-base text-ink-600">{t('auth.subtitle')}</Text>
      </View>
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { value: 'login', label: t('auth.title'), testID: 'auth-mode-login' },
          { value: 'register', label: t('auth.registerTab'), testID: 'auth-mode-register' },
        ]}
      />
      {/* key: a fresh form per tab, so one tab's errors never show in the other */}
      <EmailForm key={mode} mode={mode} defaultEmail={email} onEmailChange={setEmail} onCodeSent={onCodeSent} />
    </AuthFrame>
  );
}

/**
 * Shared frame of the sign-in screens: wordmark on top, content centred. It scrolls, so the form
 * stays reachable on small phones, with large text, and with the keyboard open. On iOS the scroll
 * view itself makes room for the keyboard and keeps the focused field above it (padding from the
 * keyboard-avoiding view as well would count the keyboard twice); on Android the padding does it.
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-stone-100">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? undefined : 'padding'} className="flex-1">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerClassName="flex-grow px-4 pb-10"
        >
          <View className="min-h-14 flex-row items-center">
            <Wordmark />
          </View>
          <View className="flex-1 justify-center gap-6">{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The sign-in screens' title: 38 pt, a little smaller on narrow phones. */
export function AuthTitle({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  return <Display size={Math.min(38, Math.floor((width - 32) / 8.6))}>{children}</Display>;
}

/** Creating an account asks for a role; signing in doesn't. */
const schemaFor = (mode: AuthMode) =>
  z
    .object({ email: emailSchema, role: z.custom<SelfSignupRole | null>() })
    .refine((v) => mode === 'login' || v.role !== null, { message: 'choose_role', path: ['role'] });
type FormSchema = ReturnType<typeof schemaFor>;

function EmailForm({
  mode,
  defaultEmail,
  onEmailChange,
  onCodeSent,
}: {
  mode: AuthMode;
  defaultEmail: string;
  onEmailChange: (email: string) => void;
  onCodeSent: (sent: PendingSignIn) => void;
}) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { supabase } = useAuth();
  const form = useForm<z.input<FormSchema>, unknown, z.output<FormSchema>>({
    resolver: zodResolver(schemaFor(mode)),
    defaultValues: { email: defaultEmail, role: null },
  });

  const rootText = form.formState.errors.root ? t('common.errorGeneric') : null;
  // Every error of an attempt in one announcement: on iOS a second one would cut off the first.
  const [said, setSaid] = useState<{ text: string; attempt: number } | null>(null);
  const say = (text: string) => setSaid((prev) => ({ text, attempt: (prev?.attempt ?? 0) + 1 }));
  useAnnouncement(said?.text, said?.attempt);

  const submit = form.handleSubmit(
    async ({ email, role }) => {
      // Same request for every address (a new one gets an account). The role is not sent: anyone
      // could send one for any email, so it is saved only after the code proves the address.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, data: { locale: currentLocale() } satisfies SignupMetadata },
      });
      if (error) {
        form.setError('root', { message: error.message });
        say(t('common.errorGeneric'));
        return;
      }
      onCodeSent({ email, mode, role: mode === 'register' ? role : null });
    },
    (errors) => say([errors.role?.message, errors.email?.message].map(errorText).filter(Boolean).join(' ')),
  );

  return (
    <View className="gap-4">
      {mode === 'register' ? (
        <Controller
          control={form.control}
          name="role"
          render={({ field, fieldState }) => (
            <RoleChoice value={field.value} onChange={field.onChange} error={errorText(fieldState.error?.message)} />
          )}
        />
      ) : null}
      <Controller
        control={form.control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            ref={field.ref}
            testID="auth-email"
            label={t('auth.emailLabel')}
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
            returnKeyType="send"
            onSubmitEditing={submit}
            value={field.value}
            onChangeText={(value) => {
              field.onChange(value);
              onEmailChange(value);
            }}
            onBlur={field.onBlur}
            error={errorText(fieldState.error?.message)}
            announceError={false}
          />
        )}
      />
      {rootText ? <Text className="font-sans text-sm text-danger">{rootText}</Text> : null}
      <Button
        testID="auth-send-code"
        variant="primary"
        title={t('auth.sendCode')}
        onPress={submit}
        loading={form.formState.isSubmitting}
      />
    </View>
  );
}
