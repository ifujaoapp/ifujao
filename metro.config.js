const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.conditionNames = [
  'react-native',
  ...(config.resolver.conditionNames || []),
];

module.exports = config;
