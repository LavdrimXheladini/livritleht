import type { ReactNode, Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, tokens } from '@movershub/ui';

import { useAnnouncement } from '../a11y';
import { cx } from './cx';
import { LogoMark } from './icons';

// Mobile versions of the web primitives in packages/ui/src/web (same names, variants and tokens),
// styled with NativeWind classes from packages/ui/tailwind-preset.js — never raw colour values.
// `tone="dark"` = the night palette of the mover app and live screens.
// Every element gets ONE class per property (one font, one border colour, one gap): `cx` doesn't
// merge like the website's `cn`, and on the phone the stylesheet order decides, not the class order.

export type Tone = 'light' | 'dark';

/* ── Screen ────────────────────────────────────────────────────────────── */

/** Safe-area page: stone background (light) or night (dark); scrolls unless `scroll={false}`. */
export function Screen({
  tone = 'light',
  scroll = true,
  children,
  contentClassName,
}: {
  tone?: Tone;
  scroll?: boolean;
  children: ReactNode;
  contentClassName?: string;
}) {
  const bg = tone === 'dark' ? 'bg-night-900' : 'bg-stone-100';
  const content = cx('gap-5 px-4 pb-10 pt-3', contentClassName);
  return (
    <SafeAreaView className={cx('flex-1', bg)} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerClassName={content}>
          {children}
        </ScrollView>
      ) : (
        <View className={cx('flex-1', content)}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/* ── Typography ────────────────────────────────────────────────────────── */

const display = tokens.typography.display;
const em = (value: string) => Number.parseFloat(value) || 0;

/**
 * Archivo display headline ("Move anything, wherever home is."). Letter spacing and line height
 * are computed from the tokens here — React Native has no `em` units.
 */
export function Display({
  size = 34,
  tone = 'light',
  accent,
  className,
  children,
  style,
  accessibilityRole = 'header',
}: {
  size?: number;
  tone?: Tone;
  /** Copper text, e.g. the mover's payout. */
  accent?: boolean;
  className?: string;
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  accessibilityRole?: 'header' | 'text';
}) {
  const color = accent ? (tone === 'dark' ? 'text-accent-300' : 'text-accent-700') : tone === 'dark' ? 'text-night-50' : 'text-ink-900';
  return (
    <Text
      accessibilityRole={accessibilityRole}
      className={cx('font-display', color, className)}
      style={[{ fontSize: size, lineHeight: Math.round(size * 1.02), letterSpacing: em(display.tracking) * size }, style]}
    >
      {children}
    </Text>
  );
}

/**
 * Logo mark + MOVERSHUB wordmark; `partner` adds the mover app's "Partner" label. A screen reader
 * reads it as one logo image, "MoversHub Partner" (each screen's heading is its Display title).
 */
export function Wordmark({ tone = 'light', partner }: { tone?: Tone; partner?: string }) {
  const ink = tone === 'dark' ? colors.night[50] : colors.ink[900];
  const size = 15;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={partner ? `MoversHub ${partner}` : 'MoversHub'}
      className="flex-row items-center gap-2"
    >
      <View className={cx('size-8 items-center justify-center rounded-md', tone === 'dark' ? 'bg-accent-500' : 'bg-brand-500')}>
        <LogoMark size={17} color={tone === 'dark' ? colors.ink[900] : colors.stone[50]} />
      </View>
      <Text
        className="font-wordmark"
        style={{ color: ink, fontSize: size, letterSpacing: em(tokens.typography.wordmark.tracking) * size }}
      >
        MOVERSHUB
      </Text>
      {partner ? <Text className="font-sans-medium text-[13px] text-accent-300">{partner}</Text> : null}
    </View>
  );
}

/* ── Button ────────────────────────────────────────────────────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'outline-dark' | 'link' | 'link-dark';

const BUTTON: Record<ButtonVariant, { box: string; text: string; spinner: string }> = {
  /** Deep-green pill — the main action. */
  primary: { box: 'bg-brand-500 active:bg-brand-600', text: 'font-sans-medium text-stone-50', spinner: colors.stone[50] },
  secondary: { box: 'bg-stone-300 active:bg-stone-400', text: 'font-sans-medium text-ink-900', spinner: colors.ink[900] },
  /** Copper — live actions ("Accept job", "Share live link"). */
  accent: { box: 'bg-accent-500 active:bg-accent-300', text: 'font-sans-semibold text-ink-900', spinner: colors.ink[900] },
  outline: {
    box: 'border border-stone-400 bg-stone-50 active:border-ink-300',
    text: 'font-sans-medium text-ink-900',
    spinner: colors.ink[900],
  },
  ghost: { box: 'active:bg-stone-200', text: 'font-sans-medium text-ink-900', spinner: colors.ink[900] },
  /** Outline on dark surfaces ("Decline"). */
  'outline-dark': { box: 'border border-brand-300 active:bg-night-700', text: 'font-sans-medium text-night-50', spinner: colors.night[50] },
  /** Ink, like the website's links (the design draws links in ink). */
  link: { box: '', text: 'font-sans-medium text-ink-900 underline', spinner: colors.ink[900] },
  /** Link on night surfaces (readable copper). */
  'link-dark': { box: '', text: 'font-sans-medium text-accent-300 underline', spinner: colors.accent[300] },
};

// Every size is at least 44 pt tall on the phone (touch targets), and links at least 44 pt wide
// (Albanian "Dil" / "Hyr" are shorter); sm/md differ in padding and text.
const BUTTON_SIZE = {
  sm: { box: 'min-h-11 px-3.5', text: 'text-[13px]' },
  md: { box: 'min-h-11 px-5', text: 'text-sm' },
  lg: { box: 'min-h-[52px] px-[26px]', text: 'text-[15px]' },
} as const;

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  size = 'lg',
  icon,
  className,
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZE;
  /** Optional icon before the title. */
  icon?: ReactNode;
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const v = BUTTON[variant];
  const s = BUTTON_SIZE[size];
  const isLink = variant === 'link' || variant === 'link-dark';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      testID={testID}
      accessibilityRole="button"
      // The title stays the button's name while the spinner replaces it.
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className={cx(
        'flex-row items-center justify-center gap-2',
        isLink ? 'min-h-11 min-w-11 px-2' : cx('rounded-full', s.box),
        v.box,
        (disabled || loading) && 'opacity-60',
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : (
        <>
          {icon}
          {/* Long translations wrap, centred, inside the pill. */}
          <Text className={cx('shrink text-center', s.text, v.text)}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ── Pill (static label) ──────────────────────────────────────────────── */

export type PillTone = 'neutral' | 'brand' | 'accent' | 'accent-soft' | 'dark' | 'dark-muted';

const PILL: Record<PillTone, { box: string; text: string }> = {
  neutral: { box: 'bg-stone-300', text: 'font-sans text-ink-900' },
  brand: { box: 'bg-brand-500', text: 'font-sans text-stone-50' },
  accent: { box: 'bg-accent-500', text: 'font-sans-semibold text-ink-900' },
  'accent-soft': { box: 'bg-accent-900', text: 'font-sans text-accent-300' },
  dark: { box: 'bg-night-500', text: 'font-sans text-night-50' },
  'dark-muted': { box: 'bg-night-600', text: 'font-sans text-night-50' },
};

export function Pill({
  children,
  tone = 'neutral',
  size = 'md',
  shape = 'round',
}: {
  children: ReactNode;
  tone?: PillTone;
  size?: 'sm' | 'md';
  shape?: 'round' | 'tag';
}) {
  const p = PILL[tone];
  return (
    <View
      className={cx(
        'self-start',
        shape === 'round' ? 'rounded-full' : 'rounded-sm',
        size === 'sm' ? 'px-[7px] py-0.5' : 'px-2.5 py-1',
        p.box,
      )}
    >
      <Text className={cx(size === 'sm' ? 'text-[10.5px]' : 'text-xs', p.text)}>{children}</Text>
    </View>
  );
}

/* ── Chips (single choice) ────────────────────────────────────────────── */

export type ChipVariant = 'pill' | 'tile' | 'dark';

const CHIP: Record<ChipVariant, { box: (on: boolean) => string; text: (on: boolean) => string }> = {
  /** Crew pills, class tabs: green when selected. */
  pill: {
    box: (on) => cx('min-h-11 rounded-full border px-3.5', on ? 'border-brand-500 bg-brand-500' : 'border-stone-400 bg-stone-50'),
    text: (on) => (on ? 'text-stone-50' : 'text-ink-900'),
  },
  /** Route suggestions: sand fill, green outline when selected. */
  tile: {
    box: (on) => cx('min-h-11 rounded-md border-[1.5px] px-4', on ? 'border-brand-500 bg-stone-50' : 'border-stone-150 bg-stone-150'),
    text: (on) => (on ? 'text-ink-900' : 'text-ink-600'),
  },
  /** Segmented toggle on dark. */
  dark: {
    box: (on) => cx('min-h-11 rounded-full px-4', on && 'bg-night-50'),
    text: (on) => (on ? 'text-ink-900' : 'text-sage-400'),
  },
};

export type ChipOption<T extends string | number> = { value: T; label: string };

/** Single-choice row with radio semantics (accessibilityRole "radio" + selected state). */
export function ChipGroup<T extends string | number>({
  value,
  onChange,
  options,
  accessibilityLabel,
  label,
  variant = 'pill',
  wrap = true,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly ChipOption<T>[];
  /** Name of the group for screen readers. */
  accessibilityLabel: string;
  /** Visible label before the chips, e.g. "Crew". */
  label?: string;
  variant?: ChipVariant;
  /** Wrap onto more lines (default) or scroll sideways. */
  wrap?: boolean;
}) {
  const chips = options.map((o) => {
    const on = o.value === value;
    const c = CHIP[variant];
    return (
      <Pressable
        key={String(o.value)}
        onPress={() => onChange(o.value)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on, checked: on }}
        className={cx('items-center justify-center', c.box(on))}
      >
        <Text className={cx('font-sans text-[13px]', c.text(on))}>{o.label}</Text>
      </Pressable>
    );
  });
  const box = cx(
    'flex-row items-center',
    variant === 'dark' ? 'gap-1 rounded-full border border-night-600 bg-night-800 p-1' : variant === 'tile' ? 'gap-2' : 'gap-1.5',
  );
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} className="gap-2">
      {label ? <Text className="font-sans text-[13px] text-ink-600">{label}</Text> : null}
      {wrap ? (
        <View className={cx(box, 'flex-wrap')}>{chips}</View>
      ) : (
        // "handled", like the page's ScrollView: the first tap on a chip lands while the keyboard is open.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName={box}>
          {chips}
        </ScrollView>
      )}
    </View>
  );
}

/** Crew size: "Mover only · +1 helper · +2 helpers" (labels from i18n). */
export function CrewPills({
  value,
  onChange,
  labels,
  groupLabel,
}: {
  value: 1 | 2 | 3;
  onChange: (crew: 1 | 2 | 3) => void;
  labels: Record<1 | 2 | 3, string>;
  groupLabel: string;
}) {
  return (
    <ChipGroup
      value={value}
      onChange={onChange}
      accessibilityLabel={groupLabel}
      label={groupLabel}
      options={([1, 2, 3] as const).map((n) => ({ value: n, label: labels[n] }))}
    />
  );
}

/** Two or three equal options in one rounded bar (sign-in: Phone / Email). */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  tone = 'light',
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  tone?: Tone;
}) {
  const dark = tone === 'dark';
  return (
    <View
      accessibilityRole="tablist"
      className={cx('flex-row gap-1 rounded-full p-1', dark ? 'border border-night-600 bg-night-800' : 'bg-stone-150')}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            className={cx(
              'min-h-11 flex-1 items-center justify-center rounded-full px-3',
              on && (dark ? 'bg-night-50' : 'bg-brand-500'),
            )}
          >
            <Text
              className={cx(
                'font-sans-medium text-sm',
                on ? (dark ? 'text-ink-900' : 'text-stone-50') : dark ? 'text-sage-400' : 'text-ink-600',
              )}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Text field ───────────────────────────────────────────────────────── */

/**
 * Labelled input. An error turns the border red, shows under the field and is read out when it
 * appears; the input's spoken name carries the label and the error. `ref` lets a form focus it.
 */
export function TextField({
  label,
  error,
  tone = 'light',
  ref,
  ...props
}: TextInputProps & { label: string; error?: string | undefined; tone?: Tone; ref?: Ref<TextInput> }) {
  const dark = tone === 'dark';
  useAnnouncement(error);
  return (
    <View className="gap-1.5">
      {/* The input says the label and the error itself, so these texts are not read twice. */}
      <Text aria-hidden className={cx('font-sans text-[13px]', dark ? 'text-sage-400' : 'text-ink-600')}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={error ? `${label}, ${error}` : label}
        placeholderTextColor={dark ? colors.sage[500] : colors.ink[500]}
        className={cx(
          'min-h-[52px] rounded-input border px-4 font-sans text-base',
          dark ? 'bg-night-800 text-night-50' : 'bg-stone-150 text-ink-900',
          error ? (dark ? 'border-danger-on-dark' : 'border-danger') : dark ? 'border-night-600' : 'border-stone-150',
        )}
        {...props}
      />
      {error ? (
        <Text aria-hidden className={cx('font-sans text-[13px]', dark ? 'text-danger-on-dark' : 'text-danger')}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/* ── Surfaces ─────────────────────────────────────────────────────────── */

const CARD = {
  /** Stat cards. */
  paper: 'rounded-card bg-stone-50 p-[22px] shadow-card',
  /** Quote widget: hairline border + large soft shadow. */
  widget: 'rounded-xl border border-stone-300 bg-stone-50 p-4 shadow-sheet',
  outline: 'rounded-card border border-stone-300 bg-stone-50 p-2',
  /** Highlighted note. */
  inset: 'rounded-lg bg-stone-150 p-4',
} as const;

export function Card({ variant = 'paper', className, children }: { variant?: keyof typeof CARD; className?: string; children: ReactNode }) {
  return <View className={cx(CARD[variant], className)}>{children}</View>;
}

const DARK = {
  /** Panels, timeline bar. */
  panel: 'rounded-panel border border-night-600 bg-night-800 p-3.5',
  /** Floating card over a map. */
  overlay: 'rounded-lg border border-night-500 bg-night-900/90 p-4',
  /** Small stat tile. */
  tile: 'rounded-md bg-night-800 p-2.5',
  /** Device frame. */
  frame: 'rounded-device bg-night-900 p-3 shadow-device',
} as const;

export function DarkPanel({ variant = 'panel', className, children }: { variant?: keyof typeof DARK; className?: string; children: ReactNode }) {
  return <View className={cx(DARK[variant], className)}>{children}</View>;
}

export function ProgressBar({ value, label, track = 'dark' }: { value: number; label: string; track?: 'dark' | 'light' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      className={cx('h-1 w-full overflow-hidden rounded-full', track === 'dark' ? 'bg-night-600' : 'bg-stone-300')}
    >
      <View className="h-full bg-accent-500" style={{ width: `${pct}%` }} />
    </View>
  );
}

/* ── Vehicle class ────────────────────────────────────────────────────── */

/**
 * One vehicle class as a full-width row (phone layout of the web tile): name, capacity chip and
 * what fits on the left, "from" + price + offers on the right. The price is pre-formatted from the
 * SERVER quote — never computed in the app (COMPLIANCE §1.1). No price → `unavailable`, disabled.
 */
export function VehicleClassTile({
  name,
  capacity,
  fits,
  pricePrefix,
  priceLabel,
  offersLabel,
  unavailable,
  selected,
  busy,
  onPress,
  testID,
}: {
  name: string;
  capacity: string;
  fits: string;
  pricePrefix?: string;
  priceLabel?: string;
  offersLabel?: string;
  unavailable?: string;
  selected: boolean;
  /** The price is still the last route's while the new route is quoted. */
  busy?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const noOffers = priceLabel === undefined;
  const muted = selected ? 'text-stone-50/75' : 'text-ink-600';
  return (
    <Pressable
      onPress={onPress}
      disabled={noOffers}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected, disabled: noOffers, busy }}
      accessibilityLabel={[name, capacity, fits, noOffers ? unavailable : `${pricePrefix ?? ''} ${priceLabel}`, offersLabel]
        .filter(Boolean)
        .join(', ')}
      className={cx(
        'min-h-[76px] flex-row items-center gap-3 rounded-input border px-4 py-3.5',
        selected ? 'border-brand-500 bg-brand-500' : 'border-stone-400 bg-stone-50',
        noOffers && 'opacity-60',
      )}
    >
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className={cx('font-sans-semibold text-[15px]', selected ? 'text-stone-50' : 'text-ink-900')}>{name}</Text>
          <View className={cx('rounded-full px-2 py-[3px]', selected ? 'bg-accent-500' : 'bg-stone-300')}>
            <Text className={cx('font-sans text-xs', selected ? 'text-ink-900' : 'text-ink-700')}>{capacity}</Text>
          </View>
        </View>
        <Text className={cx('font-sans text-[12.5px]', muted)} numberOfLines={2}>
          {fits}
        </Text>
      </View>
      <View className="items-end">
        {noOffers ? (
          <Text className={cx('max-w-[110px] text-right font-sans text-[12.5px]', muted)}>{unavailable}</Text>
        ) : (
          <>
            {pricePrefix ? <Text className={cx('font-sans text-[11.5px]', muted)}>{pricePrefix}</Text> : null}
            <Display size={22} tone={selected ? 'dark' : 'light'} accessibilityRole="text">
              {priceLabel}
            </Display>
            {offersLabel ? <Text className={cx('font-sans text-[11.5px]', muted)}>{offersLabel}</Text> : null}
          </>
        )}
      </View>
    </Pressable>
  );
}
