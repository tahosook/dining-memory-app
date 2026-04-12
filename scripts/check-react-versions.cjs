const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');

function resolveOptional(modulePath) {
  try {
    return require.resolve(modulePath);
  } catch {
    return null;
  }
}

const reactPackagePath = require.resolve('react/package.json');
const reactNativePackagePath = require.resolve('react-native/package.json');
const reactVersion = require(reactPackagePath).version;

const rendererCandidates = [
  resolveOptional('react-native-renderer/package.json'),
  path.join(path.dirname(reactNativePackagePath), 'node_modules', 'react-native-renderer', 'package.json'),
].filter(Boolean);

const rendererPackagePath = rendererCandidates.find(candidate => fs.existsSync(candidate));

if (!rendererPackagePath) {
  const reactNativePackage = require(reactNativePackagePath);
  const expectedReactRange = reactNativePackage.peerDependencies?.react;

  if (!expectedReactRange) {
    console.error('check failed: react-native-renderer package.json not found and react-native peer range is unavailable');
    process.exit(2);
  }

  if (!semver.satisfies(reactVersion, expectedReactRange)) {
    console.error('ERROR: react version does not satisfy react-native peer range:', reactVersion, expectedReactRange);
    process.exit(1);
  }

  console.log('OK: react satisfies react-native peer range:', reactVersion, expectedReactRange);
  process.exit(0);
}

const rendererVersion = require(rendererPackagePath).version;

if (reactVersion !== rendererVersion) {
  console.error('ERROR: react vs react-native-renderer version mismatch:', reactVersion, rendererVersion);
  process.exit(1);
}

console.log('OK: react and react-native-renderer match:', reactVersion);
