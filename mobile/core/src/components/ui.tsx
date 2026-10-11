import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@ranktrip/ui';

export function Button({
  title,
  onPress,
  loading,
  variant = 'primary',
  testID,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'link';
  testID?: string;
}) {
  if (variant === 'link') {
    return (
      <Pressable onPress={onPress} className="py-2" testID={testID}>
        <Text className="text-center text-sm text-brand-600">{title}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      testID={testID}
      className="items-center rounded-md bg-brand-500 px-4 py-3 active:bg-brand-600 disabled:opacity-60"
    >
      {loading ? (
        <ActivityIndicator color={colors.stone[50]} />
      ) : (
        <Text className="text-base font-semibold text-white">{title}</Text>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | undefined }) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-ink-700">{label}</Text>
      <TextInput
        placeholderTextColor={colors.ink[500]}
        className="rounded-md border border-ink-300 px-3 py-3 text-base text-ink-900"
        {...props}
      />
      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
    </View>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row rounded-md bg-ink-100 p-1">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === o.value }}
          className={`flex-1 items-center rounded px-3 py-2 ${value === o.value ? 'bg-white' : ''}`}
        >
          <Text className={value === o.value ? 'font-medium text-ink-900' : 'text-ink-500'}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
