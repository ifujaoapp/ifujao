const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.conditionNames = [
  'react-native',
  ...(config.resolver.conditionNames || []),
];

// Limita workers do Transformer para reduzir uso de CPU (padrao = numero de cores)
config.maxWorkers = 2;

module.exports = config;
