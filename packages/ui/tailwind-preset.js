// NativeWind (Tailwind 3) preset for the Expo apps. Everything comes from tokens.json.
const tokens = require('./tokens.json');

const px = (n) => `${n}px`;
const nf = tokens.nativeFonts;

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: tokens.colors,
      borderRadius: Object.fromEntries(Object.entries(tokens.radius).map(([k, v]) => [k, px(v)])),
      boxShadow: tokens.shadow,
      spacing: { gutter: px(tokens.spacing.gutter) },
      // React Native can't stretch a variable font, so the display/wordmark faces are static
      // instances of Archivo at the token width (generated into assets/fonts).
      fontFamily: {
        display: [nf.display],
        wordmark: [nf.wordmark],
        sans: [nf.body],
        'sans-medium': [nf.bodyMedium],
        'sans-semibold': [nf.bodySemibold],
        mono: [nf.mono],
        'mono-medium': [nf.monoMedium],
      },
      letterSpacing: { display: tokens.typography.display.tracking, wordmark: tokens.typography.wordmark.tracking },
      lineHeight: { display: String(tokens.typography.display.leading) },
    },
  },
};
