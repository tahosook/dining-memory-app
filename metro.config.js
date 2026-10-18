const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

const escapedRoot = __dirname.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
const ignoredDirs = [
  new RegExp(`^${escapedRoot}\\/artifacts\\/.*`),
  new RegExp(`^${escapedRoot}\\/state\\/.*`),
  new RegExp(`^${escapedRoot}\\/\\.venv.*\\/.*`),
  new RegExp(`^${escapedRoot}\\/android\\/(?:app\\/)?build\\/.*`),
  new RegExp(`^${escapedRoot}\\/android\\/\\.gradle\\/.*`),
];

const existingBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
    ? [config.resolver.blockList]
    : [];

config.resolver.blockList = [...existingBlockList, ...ignoredDirs];

module.exports = config;
