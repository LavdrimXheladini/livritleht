// Expo's default config detects the pnpm workspace (watch folders + node_modules paths).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { withSingletons } = require('@movershub/mobile/metro-singletons');

// inlineRem 16: 1rem = 16 px like the website (NativeWind's default is 14, which shrinks every
// spacing and text class to 87.5% and makes 44 pt touch targets come out at 38.5 pt).
const config = withNativeWind(getDefaultConfig(__dirname), { input: './src/global.css', inlineRem: 16 });

// One copy of React / NativeWind for app + mobile/core (see mobile/core/metro-singletons.js).
module.exports = withSingletons(config, __dirname);
