/** Joins NativeWind class names, skipping falsy parts: cx('a', on && 'b'). */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
