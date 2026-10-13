import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { passwordSchema } from '@movershub/shared';

import { useAuth } from '../auth-provider';
import { Button } from '../components/ui';
import { passwordErrorKey } from '../password';
import { useAuthErrorText } from './auth-errors';
import { AuthFrame, AuthTitle } from './auth-screen';
import { PasswordField } from './password-field';

const schema = z.object({ password: passwordSchema });

/**
 * Signed in by a code, the person sets their password before anything else: `create` after the code
 * of "Create account", `reset` after "Forgot password?". From then on they sign in with email and
 * password. (A password set before the address was proven has already been cleared on the server.)
 */
export function PasswordScreen({ purpose, onSaved }: { purpose: 'create' | 'reset'; onSaved: () => void }) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const { supabase, signOut, signingOut } = useAuth();
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '' },
  });

  const submit = form.handleSubmit(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      form.setError('password', { message: passwordErrorKey(error) });
      return;
    }
    onSaved();
  });

  return (
    <AuthFrame>
      <View className="gap-2">
        <AuthTitle>{purpose === 'reset' ? t('auth.newPasswordTitle') : t('auth.createPasswordTitle')}</AuthTitle>
        <Text className="font-sans text-base text-ink-600">
          {purpose === 'reset' ? t('auth.newPasswordSubtitle') : t('auth.createPasswordSubtitle')}
        </Text>
      </View>
      <View className="gap-2">
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <PasswordField
              kind="new"
              testID="password-new"
              label={t('auth.passwordLabel')}
              hint={t('auth.passwordHint')}
              fieldRef={field.ref}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              onSubmitEditing={submit}
              error={errorText(fieldState.error?.message)}
            />
          )}
        />
      </View>
      <Button testID="password-save" variant="primary" title={t('auth.savePassword')} onPress={submit} loading={form.formState.isSubmitting} />
      <Button
        testID="password-sign-out"
        variant="link"
        className="self-center"
        title={t('common.signOut')}
        loading={signingOut}
        onPress={() => void signOut()}
      />
    </AuthFrame>
  );
}
