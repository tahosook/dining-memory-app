import path from 'path';
import { getConfig } from 'expo/config';

const appJson = require('../app.json') as {
  expo: {
    version: string;
    runtimeVersion: string;
    updates: {
      enabled: boolean;
      url: string;
      requestHeaders?: Record<string, string>;
    };
    android: {
      package: string;
      versionCode: number;
    };
    ios: {
      bundleIdentifier: string;
      buildNumber: string;
    };
    plugins: unknown[];
    extra: {
      eas: {
        projectId: string;
      };
    };
  };
};

const appConfigFactory = require('../app.config.js') as (props?: {
  config?: Record<string, unknown>;
}) => Record<string, unknown>;

describe('app.config.js Expo config resolution', () => {
  const projectRoot = path.resolve(__dirname, '..');

  it('preserves runtimeVersion, updates, extra.eas.projectId, plugins, and injects build metadata when resolved via expo/config', () => {
    const { exp } = getConfig(projectRoot, {
      isPublicConfig: false,
      skipSDKVersionRequirement: true,
    });

    expect(exp.runtimeVersion).toBe(appJson.expo.runtimeVersion);
    expect(exp.runtimeVersion).toBe('1.0.0');
    expect(exp.updates?.enabled).toBe(true);
    expect(exp.updates?.url).toBe(appJson.expo.updates.url);
    expect(exp.updates?.requestHeaders).toEqual(appJson.expo.updates.requestHeaders);
    expect(exp.plugins).toEqual(appJson.expo.plugins);
    expect(exp.version).toBe(appJson.expo.version);
    expect(exp.android?.package).toBe(appJson.expo.android.package);
    expect(exp.android?.versionCode).toBe(appJson.expo.android.versionCode);
    expect(exp.ios?.bundleIdentifier).toBe(appJson.expo.ios.bundleIdentifier);
    expect(exp.ios?.buildNumber).toBe(appJson.expo.ios.buildNumber);
    expect(exp.extra?.eas?.projectId).toBe(appJson.expo.extra.eas.projectId);
    expect(typeof exp.extra?.commitHash).toBe('string');
    expect(String(exp.extra?.commitHash).length).toBeGreaterThan(0);
    expect(typeof exp.extra?.buildDate).toBe('string');
    expect(String(exp.extra?.buildDate).length).toBeGreaterThan(0);
  });

  it('merges extra fields without clobbering existing keys and applies default android/ios build numbers', () => {
    const prevCommitHash = process.env.COMMIT_HASH;
    const prevBuildDate = process.env.BUILD_DATE;
    process.env.COMMIT_HASH = 'deadbee';
    process.env.BUILD_DATE = '2026-11-28T00:00:00Z';

    try {
      const resolved = appConfigFactory({
        config: {
          version: '1.2.3',
          extra: {
            eas: { projectId: 'project-123' },
            existingKey: 'kept',
          },
        },
      });

      expect(resolved.version).toBe('1.2.3');
      expect(resolved.android).toEqual({ versionCode: 1 });
      expect(resolved.ios).toEqual({ buildNumber: '1' });
      expect(resolved.extra).toEqual({
        eas: { projectId: 'project-123' },
        existingKey: 'kept',
        commitHash: 'deadbee',
        buildDate: '2026-11-28T00:00:00Z',
      });
    } finally {
      if (prevCommitHash === undefined) {
        delete process.env.COMMIT_HASH;
      } else {
        process.env.COMMIT_HASH = prevCommitHash;
      }
      if (prevBuildDate === undefined) {
        delete process.env.BUILD_DATE;
      } else {
        process.env.BUILD_DATE = prevBuildDate;
      }
    }
  });
});
