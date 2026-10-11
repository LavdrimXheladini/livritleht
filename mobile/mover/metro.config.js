// Expo's default config detects the pnpm workspace (watch folders + node_modules paths).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { withSingletons } = require('@ranktrip/mobile/metro-singletons');

const config = withNativeWind(getDefaultConfig(__dirname), { input: './src/global.css' });

// One copy of React / NativeWind for app + mobile/core (see mobile/core/metro-singletons.js).
module.exports = withSingletons(config, __dirname);
