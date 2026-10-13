import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { SelfSignupRole } from '@movershub/shared';

import { cx } from '../components/cx';

/**
 * "How will you use MoversHub?" — I need a mover / I'm a mover, as a radio group. Used when
 * creating an account, and after the first sign-in by an account that has no role yet. The screen
 * around it reads the error out (with its other errors, in one announcement).
 */
export function RoleChoice({
  value,
  onChange,
  error,
  showLabel = true,
}: {
  value: SelfSignupRole | null;
  onChange: (role: SelfSignupRole) => void;
  error?: string | undefined;
  /** Off when the screen's title already asks the question. */
  showLabel?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-2.5">
      {showLabel ? (
        <Text nativeID="role-question" className="font-sans-medium text-sm text-ink-700">
          {t('auth.roleLabel')}
        </Text>
      ) : null}
      <View
        accessibilityRole="radiogroup"
        // Named by the visible question when there is one (no second reading of it).
        aria-labelledby={showLabel ? 'role-question' : undefined}
        accessibilityLabel={showLabel ? undefined : t('auth.roleLabel')}
        className="gap-2.5"
      >
        <RoleOption
          testID="role-customer"
          title={t('auth.roleCustomer')}
          hint={t('auth.roleCustomerHint')}
          selected={value === 'customer'}
          error={error}
          onPress={() => onChange('customer')}
        />
        <RoleOption
          testID="role-mover"
          title={t('auth.roleMover')}
          hint={t('auth.roleMoverHint')}
          selected={value === 'mover'}
          error={error}
          onPress={() => onChange('mover')}
        />
      </View>
      {error ? (
        <Text aria-hidden className="font-sans text-sm text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One choice, styled like a vehicle-class tile. Its spoken name carries the error too (like
 * TextField's), so every platform says it; `aria-checked` for the browser version
 * (react-native-web ignores accessibilityState).
 */
function RoleOption({
  title,
  hint,
  selected,
  error,
  onPress,
  testID,
}: {
  title: string;
  hint: string;
  selected: boolean;
  error: string | undefined;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      aria-checked={selected}
      accessibilityLabel={[title, hint, error].filter(Boolean).join(', ')}
      className={cx(
        'min-h-[68px] justify-center gap-0.5 rounded-input border px-4 py-3',
        selected ? 'border-brand-500 bg-brand-500' : 'border-stone-400 bg-stone-50',
      )}
    >
      <Text className={cx('font-sans-semibold text-base', selected ? 'text-stone-50' : 'text-ink-900')}>{title}</Text>
      <Text className={cx('font-sans text-[13px] leading-[18px]', selected ? 'text-stone-50/75' : 'text-ink-600')}>{hint}</Text>
    </Pressable>
  );
}
