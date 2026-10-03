const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withPreviewCleartext(config) {
  const profile = process.env.EAS_BUILD_PROFILE;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  if ((profile === 'online' || profile === 'production') && !/^https:\/\//i.test(apiUrl ?? '')) {
    throw new Error(`Configure EXPO_PUBLIC_API_URL com HTTPS antes de gerar a build ${profile}.`);
  }
  if (profile !== 'preview') return config;

  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('Android application manifest entry was not found.');
    }

    application.$ ??= {};
    application.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
};