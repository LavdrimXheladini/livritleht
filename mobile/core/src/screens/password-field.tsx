import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextInput } from 'react-native';

import { Button, TextField } from '../components/ui';

/**
 * A password input with "Show password". `kind`: the account's current password (sign in) or a new
 * one, so password managers fill in, or suggest, the right thing — on iOS with the same rules as
 * the server (at least 8 characters, a letter and a digit).
 */
export function PasswordField({
  kind,
  testID,
  label,
  hint,
  value,
  onChangeText,
  onBlur,
  onSubmitEditing,
  error,
  announceError,
  fieldRef,
}: {
  kind: 'current' | 'new';
  testID: string;
  label: string;
  /** The rules for a new password, shown under the input and read with its name. */
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  onSubmitEditing: () => void;
  error: string | undefined;
  announceError?: boolean;
  fieldRef?: Ref<TextInput>;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <View className="gap-1">
      <TextField
        ref={fieldRef}
        testID={testID}
        label={label}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={kind === 'new' ? 'new-password' : 'current-password'}
        textContentType={kind === 'new' ? 'newPassword' : 'password'}
        hint={hint}
        passwordRules={kind === 'new' ? 'minlength: 8; maxlength: 72; required: lower, upper; required: digit;' : undefined}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        error={error}
        announceError={announceError}
      />
      <Button
        testID={`${testID}-toggle`}
        variant="link"
        size="sm"
        className="self-start"
        title={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        onPress={() => setVisible((shown) => !shown)}
      />
    </View>
  );
}
