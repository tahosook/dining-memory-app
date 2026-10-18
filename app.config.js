// Expo configuration with build metadata injection for EAS builds
// EAS provides: COMMIT_HASH, EAS_BUILD_COMMIT_HASH, EAS_BUILD_ID, etc.

module.exports = (props = {}) => {
  const { config = {} } = props;
  const expo = config.expo || {};

  // Try multiple sources for commit hash: EAS_BUILD_COMMIT_HASH, COMMIT_HASH env var, or use git rev-parse
  let resolvedCommitHash = process.env.EAS_BUILD_COMMIT_HASH || process.env.COMMIT_HASH;
  if (!resolvedCommitHash) {
    try {
      resolvedCommitHash = require('child_process')
        .execSync('git rev-parse --short=7 HEAD 2>/dev/null', { encoding: 'utf-8' })
        .trim();
    } catch (_) {}
  }

  // Use BUILD_DATE env var, EAS_BUILD_DATE, latest git commit timestamp, or fallback to current time
  let resolvedBuildDate = process.env.BUILD_DATE || process.env.EAS_BUILD_DATE;
  if (!resolvedBuildDate) {
    try {
      resolvedBuildDate = require('child_process')
        .execSync('git log -1 --format=%cI 2>/dev/null', { encoding: 'utf-8' })
        .trim();
    } catch (_) {}
  }
  if (!resolvedBuildDate) {
    resolvedBuildDate = new Date().toISOString();
  }

  const extra = { ...expo.extra };
  if (resolvedCommitHash) {
    extra.commitHash = resolvedCommitHash;
  }
  extra.buildDate = resolvedBuildDate;

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