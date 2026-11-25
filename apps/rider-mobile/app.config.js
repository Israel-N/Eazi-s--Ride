const staticConfig = require('./app.json').expo;

module.exports = ({ config }) => ({
  ...staticConfig,
  ...config,

  android: {
    ...staticConfig.android,
    ...(config?.android || {}),
    usesCleartextTraffic: true,
  },

  plugins: [
    ...(staticConfig.plugins || []),
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    ],
    './plugins/withAndroidCleartextTraffic',
  ],
});
