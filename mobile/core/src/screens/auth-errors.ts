import { useTranslation } from 'react-i18next';

const AUTH_ERRORS = [
  'invalid_email',
  'invalid_code',
  'wrong_code',
  'choose_role',
  'password_required',
  'wrong_credentials',
  'password_too_short',
  'password_too_long',
  'password_weak',
  'same_password',
  'too_many_attempts',
] as const;
type AuthError = (typeof AUTH_ERRORS)[number];

const isAuthError = (m: string | undefined): m is AuthError =>
  (AUTH_ERRORS as readonly string[]).includes(m ?? '');

/** Zod messages and password error keys are i18n keys (see packages/shared schemas/auth.ts). */
export function useAuthErrorText() {
  const { t } = useTranslation();
  return (message: string | undefined) =>
    message === undefined ? undefined : isAuthError(message) ? t(`auth.errors.${message}`) : t('common.errorGeneric');
}
