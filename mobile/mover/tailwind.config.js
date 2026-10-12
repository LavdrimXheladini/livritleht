/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', '../core/src/**/*.{ts,tsx}'],
  // nativewind first, then our tokens (colours, radii, shadows, fonts) on top.
  presets: [require('nativewind/preset'), require('@movershub/ui/tailwind-preset')],
  plugins: [],
};
