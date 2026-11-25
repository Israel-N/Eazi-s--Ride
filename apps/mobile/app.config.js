const staticConfig = require('./app.json').expo;

module.exports = ({ config = {} }) => ({
  ...config,
  ...staticConfig,

  plugins: staticConfig.plugins || config.plugins || [],

  android: {
    ...config.android,
    ...staticConfig.android,
    config: {
      ...config.android?.config,
      ...staticConfig.android?.config,
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ''
      }
    }
  }
});
