// Extends app.json: brand colours for splash / Android icon come from packages/ui/tokens.json.
const { colors } = require('@movershub/ui/tokens.json');

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    adaptiveIcon: { ...config.android.adaptiveIcon, backgroundColor: colors.stone[400] },
  },
  plugins: config.plugins.map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
      ? ['expo-splash-screen', { ...plugin[1], backgroundColor: colors.stone[400] }]
      : plugin,
  ),
});
