import { useTranslation } from 'react-i18next';

const AUTH_ERRORS = ['invalid_phone', 'invalid_email', 'invalid_code', 'wrong_code'] as const;
type AuthError = (typeof AUTH_ERRORS)[number];

const isAuthError = (m: string | undefined): m is AuthError =>
  (AUTH_ERRORS as readonly string[]).includes(m ?? '');

/** Zod messages are i18n keys (see packages/shared schemas/auth.ts). */
export function useAuthErrorText() {
  const { t } = useTranslation();
  return (message: string | undefined) =>
    message === undefined ? undefined : isAuthError(message) ? t(`auth.errors.${message}`) : t('common.errorGeneric');
}
