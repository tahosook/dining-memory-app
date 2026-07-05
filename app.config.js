// Expo configuration with build metadata injection for EAS builds
// EAS provides: COMMIT_HASH, EAS_BUILD_COMMIT_HASH, EAS_BUILD_ID, etc.

module.exports = (props = {}) => {
  const { config = {} } = props;
  const expo = config.expo || {};

  // Try multiple sources for commit hash: EAS_BUILD_COMMIT_HASH, COMMIT_HASH env var, or use placeholder
  const commitHash = process.env.EAS_BUILD_COMMIT_HASH || process.env.COMMIT_HASH;
  // Use BUILD_DATE env var or current time
  const buildDate = process.env.BUILD_DATE || process.env.EAS_BUILD_DATE || new Date().toISOString();

  const extra = { ...expo.extra };
  if (commitHash) {
    extra.commitHash = commitHash;
  }
  extra.buildDate = buildDate;

  return {
    ...config,
    expo: {
      ...expo,
      version: expo.version,
      android: {
        ...expo.android,
        versionCode: expo.android?.versionCode ?? 1,
      },
      ios: {
        ...expo.ios,
        buildNumber: expo.ios?.buildNumber ?? '1',
      },
      extra,
    },
  };
};