import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { emailSchema, signInPasswordSchema, type SelfSignupRole, type SignupMetadata } from '@movershub/shared';

import { useAnnouncement } from '../a11y';
import { useAuth } from '../auth-provider';
import { LanguageButton } from '../components/language-button';
import { Button, Display, SegmentedControl, TextField, Wordmark } from '../components/ui';
import { currentLocale } from '../i18n';
import { isPerAddressResendLimit, passwordErrorKey, settlePassword } from '../password';
import { getDraftEmail, setDraftEmail, setPendingSignIn, type AuthMode, type PendingSignIn } from '../pending-sign-in';
import { isSupabaseConfigured } from '../supabase';
import { useAuthErrorText } from './auth-errors';
import { PasswordField } from './password-field';
import { RoleChoice } from './role-choice';

/**
 * The app's first screen when signed out: sign in with email and password, or create an account as
 * a customer or a mover. Creating one emails a 6-digit code to confirm the address, then asks for a
 * password; "Forgot password?" (its own screen) emails a code to set a new one. Nothing here tells
 * anyone whether an address has an account: every address gets the same answers. The role picked
 * here is saved only after the code has proven the email (`public.choose_role`).
 */
export function AuthScreen({ onCodeSent, onForgotPassword }: { onCodeSent: (sent: PendingSignIn) => void; onForgotPassword: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>('login');
  // The typed address survives switching tabs and going to "Forgot password?" and back.
  const [email, setEmail] = useState(getDraftEmail);
  const changeEmail = (next: string) => {
    setEmail(next);
    setDraftEmail(next);
  };

  return (
    <AuthFrame>
      <View className="gap-2">
        <AuthTitle>{mode === 'login' ? t('auth.title') : t('auth.registerTitle')}</AuthTitle>
        <Text className="font-sans text-base text-ink-600">
          {mode === 'login' ? t('auth.passwordSubtitle') : t('auth.registerSubtitle')}
        </Text>
      </View>
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { value: 'login', label: t('auth.signIn'), testID: 'auth-mode-login' },
          { value: 'register', label: t('auth.registerTab'), testID: 'auth-mode-register' },
        ]}
      />
      {/* key: a fresh form per tab, so one tab's errors never show in the other */}
      {mode === 'login' ? (
        <PasswordSignInForm key="login" defaultEmail={email} onEmailChange={changeEmail} onForgot={onForgotPassword} />
      ) : (
        <RegisterForm key="register" defaultEmail={email} onEmailChange={changeEmail} onCodeSent={onCodeSent} />
      )}
    </AuthFrame>
  );
}

/**
 * Shared frame of the sign-in screens: wordmark and language on top, content centred. It scrolls, so the form
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
            <View className="ml-auto">
              <LanguageButton />
            </View>
          </View>
          {isSupabaseConfigured() ? null : (
            // For developers only (a released app always has its settings), so not translated.
            <Text testID="not-configured" className="rounded-lg bg-stone-150 p-3 font-sans text-[13px] leading-5 text-ink-700">
              {'Not connected: this copy of the app has no Supabase settings yet. Add mobile/app/.env (README, ' +
                '"Run it locally", step 3) and start the app again.'}
            </Text>
          )}
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

/** Every error of an attempt in one announcement: on iOS a second one would cut off the first. */
export function useAttemptAnnouncement() {
  const [said, setSaid] = useState<{ text: string; attempt: number } | null>(null);
  useAnnouncement(said?.text, said?.attempt);
  return (text: string) => setSaid((prev) => ({ text, attempt: (prev?.attempt ?? 0) + 1 }));
}

/** The email input of the signed-out forms; the typed address is shared between them. */
export function EmailInput<T extends FieldValues>({
  control,
  name,
  testID,
  returnKeyType,
  onSubmitEditing,
  onEmailChange,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  testID: string;
  returnKeyType: 'next' | 'send';
  onSubmitEditing: () => void;
  onEmailChange: (email: string) => void;
}) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          ref={field.ref}
          testID={testID}
          label={t('auth.emailLabel')}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          autoCapitalize="none"
          returnKeyType={returnKeyType}
          // "Next" moves on without closing the keyboard first.
          submitBehavior={returnKeyType === 'next' ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={onSubmitEditing}
          value={field.value as string}
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
  );
}

const signInSchema = z.object({ email: emailSchema, password: signInPasswordSchema });

/** Sign in with email and password. A wrong address and a wrong password get the same answer. */
function PasswordSignInForm({
  defaultEmail,
  onEmailChange,
  onForgot,
}: {
  defaultEmail: string;
  onEmailChange: (email: string) => void;
  onForgot: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { supabase } = useAuth();
  const say = useAttemptAnnouncement();
  const form = useForm<z.input<typeof signInSchema>, unknown, z.output<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: defaultEmail, password: '' },
  });
  const rootText = errorText(form.formState.errors.root?.message);

  const submit = form.handleSubmit(
    async ({ email, password }) => {
      // A code asked for earlier and never used is over: this sign-in needs no new password.
      setPendingSignIn(null);
      await settlePassword();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const key = passwordErrorKey(error);
        form.setError('root', { message: key });
        say(errorText(key) ?? '');
      }
    },
    (errors) => say([errors.email?.message, errors.password?.message].map(errorText).filter(Boolean).join(' ')),
  );

  return (
    <View className="gap-4">
      <EmailInput
        control={form.control}
        name="email"
        testID="auth-email"
        returnKeyType="next"
        onSubmitEditing={() => form.setFocus('password')}
        onEmailChange={onEmailChange}
      />
      <Controller
        control={form.control}
        name="password"
        render={({ field, fieldState }) => (
          <PasswordField
            kind="current"
            testID="auth-password"
            label={t('auth.passwordLabel')}
            fieldRef={field.ref}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={submit}
            error={errorText(fieldState.error?.message)}
            announceError={false}
          />
        )}
      />
      {rootText ? (
        <Text testID="auth-error" className="font-sans text-sm text-danger">
          {rootText}
        </Text>
      ) : null}
      <Button testID="auth-sign-in" variant="primary" title={t('auth.signIn')} onPress={submit} loading={form.formState.isSubmitting} />
      <Button testID="auth-forgot" variant="link" className="self-center" title={t('auth.forgotPassword')} onPress={onForgot} />
    </View>
  );
}

/** Creating an account asks for a role and the email; the code confirms the email. */
const registerSchema = z
  .object({ email: emailSchema, role: z.custom<SelfSignupRole | null>() })
  .refine((v) => v.role !== null, { message: 'choose_role', path: ['role'] });

function RegisterForm({
  defaultEmail,
  onEmailChange,
  onCodeSent,
}: {
  defaultEmail: string;
  onEmailChange: (email: string) => void;
  onCodeSent: (sent: PendingSignIn) => void;
}) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { supabase } = useAuth();
  const say = useAttemptAnnouncement();
  const form = useForm<z.input<typeof registerSchema>, unknown, z.output<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: defaultEmail, role: null },
  });
  const rootText = errorText(form.formState.errors.root?.message);

  const submit = form.handleSubmit(
    async ({ email, role }) => {
      // Same request for every address (a new one gets an account). The role is not sent: anyone
      // could send one for any email, so it is saved only after the code proves the address.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, data: { locale: currentLocale() } satisfies SignupMetadata },
      });
      if (error && !isPerAddressResendLimit(error)) {
        // Every address gets these answers (a new one sends an email too), so they can be shown.
        const key = error.status === 429 ? 'too_many_attempts' : 'generic';
        form.setError('root', { message: key });
        say(errorText(key) ?? '');
        return;
      }
      onCodeSent({ email, purpose: 'register', role });
    },
    (errors) => say([errors.role?.message, errors.email?.message].map(errorText).filter(Boolean).join(' ')),
  );

  return (
    <View className="gap-4">
      <Controller
        control={form.control}
        name="role"
        render={({ field, fieldState }) => (
          <RoleChoice value={field.value} onChange={field.onChange} error={errorText(fieldState.error?.message)} />
        )}
      />
      <EmailInput
        control={form.control}
        name="email"
        testID="auth-email"
        returnKeyType="send"
        onSubmitEditing={submit}
        onEmailChange={onEmailChange}
      />
      {rootText ? <Text className="font-sans text-sm text-danger">{rootText}</Text> : null}
      <Button testID="auth-send-code" variant="primary" title={t('auth.sendCode')} onPress={submit} loading={form.formState.isSubmitting} />
    </View>
  );
}
