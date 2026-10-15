'use client';

import { useTranslation } from 'react-i18next';

import { SELF_SIGNUP_ROLES, type SelfSignupRole } from '@movershub/shared';

/** "I need a mover" / "I'm a mover", each with what it means — as in the app's role choice. */
export function RoleRadios({
  value,
  onChange,
  error,
}: {
  value: SelfSignupRole | null;
  onChange: (role: SelfSignupRole) => void;
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const text = {
    customer: [t('auth.roleCustomer'), t('auth.roleCustomerHint')],
    mover: [t('auth.roleMover'), t('auth.roleMoverHint')],
  } as const;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={error ? 'role-error' : undefined}>
      <legend className="mb-2 p-0 text-sm text-ink-600">{t('auth.roleLabel')}</legend>
      {SELF_SIGNUP_ROLES.map((role) => (
        <label
          key={role}
          className="flex cursor-pointer items-start gap-3 rounded-input border border-stone-300 bg-stone-50 px-4 py-3 has-checked:border-brand-500 has-checked:bg-stone-100"
        >
          <input
            type="radio"
            name="role"
            value={role}
            checked={value === role}
            onChange={() => onChange(role)}
            className="mt-1 size-4 accent-brand-500"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-medium text-ink-900">{text[role][0]}</span>
            <span className="text-[13px] text-ink-600">{text[role][1]}</span>
          </span>
        </label>
      ))}
      {error ? (
        <span id="role-error" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}
