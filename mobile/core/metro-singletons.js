// Metro helper for the Expo apps: packages that must exist ONCE in the bundle.
//
// With pnpm's isolated layout, mobile/core (a workspace package) can get its own copy of a
// dependency whose peer set differs from the app's. For most packages that only costs bytes,
// but these keep global state — e.g. NativeWind's style registry lives in
// react-native-css-interop: styles registered in the app's copy are invisible to components
// rendered through core's copy, so every className silently does nothing on the phone.
// Resolving these from the app's own folder, whoever imports them, guarantees one copy.
const path = require('node:path');

const SINGLETONS = new Set([
  'react',
  'react-native',
  'nativewind',
  'react-native-css-interop',
  'react-native-reanimated',
  'react-native-safe-area-context',
]);

const packageName = (moduleName) =>
  moduleName.startsWith('@') ? moduleName.split('/').slice(0, 2).join('/') : moduleName.split('/')[0];

/** @param {import('expo/metro-config').MetroConfig} config @param {string} appDir */
function withSingletons(config, appDir) {
  const upstream = config.resolver?.resolveRequest;
  const appOrigin = path.join(appDir, 'package.json');
  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest(context, moduleName, platform) {
        const ctx = SINGLETONS.has(packageName(moduleName)) ? { ...context, originModulePath: appOrigin } : context;
        return upstream ? upstream(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform);
      },
    },
  };
}

module.exports = { withSingletons, SINGLETONS };
