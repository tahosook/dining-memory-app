import {
  getBuildEnvironment,
  getAppVersion,
  getAndroidVersionCode,
  getIosBuildNumber,
  getExpoSdkVersion,
  getGitCommitHash,
  getBuildDate,
} from '../src/utils/buildInfo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

jest.mock('expo-constants', () => {
  return {
    __esModule: true,
    default: {
      executionEnvironment: 'standalone',
      expoConfig: {
        version: '1.0.0',
        extra: {
          commitHash: 'abcdefg',
          buildDate: '2023-01-01T12:00:00.000Z',
        },
      },
      platform: {
        android: {
          versionCode: 42,
        },
        ios: {
          buildNumber: '100',
        },
      },
      supportedExpoSdks: ['48.0.0', '47.0.0'],
    },
    ExecutionEnvironment: {
      Standalone: 'standalone',
      StoreClient: 'storeClient',
    },
  };
});

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

describe('buildInfo utilities', () => {
  afterEach(() => {
    jest.clearAllMocks();
    // Reset any manual overrides
    Constants.executionEnvironment = ExecutionEnvironment.Standalone;
    if (Constants.expoConfig) {
      Constants.expoConfig.version = '1.0.0';
      if (Constants.expoConfig.extra) {
        Constants.expoConfig.extra.commitHash = 'abcdefg';
        Constants.expoConfig.extra.buildDate = '2023-01-01T12:00:00.000Z';
      }
    }
    Platform.OS = 'ios';
    Constants.platform = {
      android: { versionCode: 42 },
      ios: { buildNumber: '100' },
    };
    Constants.supportedExpoSdks = ['48.0.0', '47.0.0'];
  });

  describe('getBuildEnvironment', () => {
    it('should return "development" when __DEV__ is true', () => {
      const originalDev = global.__DEV__;
      // @ts-ignore
      global.__DEV__ = true;
      expect(getBuildEnvironment()).toBe('development');
      global.__DEV__ = originalDev;
    });

    it('should return "production" when executionEnvironment is Standalone and __DEV__ is false', () => {
      const originalDev = global.__DEV__;
      // @ts-ignore
      global.__DEV__ = false;
      Constants.executionEnvironment = ExecutionEnvironment.Standalone;
      expect(getBuildEnvironment()).toBe('production');
      global.__DEV__ = originalDev;
    });

    it('should return "preview" when executionEnvironment is not Standalone and __DEV__ is false', () => {
      const originalDev = global.__DEV__;
      // @ts-ignore
      global.__DEV__ = false;
      Constants.executionEnvironment = ExecutionEnvironment.StoreClient;
      expect(getBuildEnvironment()).toBe('preview');
      global.__DEV__ = originalDev;
    });
  });

  describe('getAppVersion', () => {
    it('should return the app version from expoConfig', () => {
      expect(getAppVersion()).toBe('1.0.0');
    });

    it('should return null if expoConfig or version is missing', () => {
      Constants.expoConfig = null;
      expect(getAppVersion()).toBeNull();
    });
  });

  describe('getAndroidVersionCode', () => {
    it('should return the versionCode when OS is android', () => {
      Platform.OS = 'android';
      expect(getAndroidVersionCode()).toBe(42);
    });

    it('should return null when OS is not android', () => {
      Platform.OS = 'ios';
      expect(getAndroidVersionCode()).toBeNull();
    });

    it('should return null when platform manifest is missing', () => {
      Platform.OS = 'android';
      Constants.platform = undefined;
      expect(getAndroidVersionCode()).toBeNull();
    });

    it('should return null when android manifest is missing', () => {
      Platform.OS = 'android';
      Constants.platform = { ios: { buildNumber: '100' } };
      expect(getAndroidVersionCode()).toBeNull();
    });
  });

  describe('getIosBuildNumber', () => {
    it('should return the buildNumber when OS is ios', () => {
      Platform.OS = 'ios';
      expect(getIosBuildNumber()).toBe('100');
    });

    it('should return null when OS is not ios', () => {
      Platform.OS = 'android';
      expect(getIosBuildNumber()).toBeNull();
    });

    it('should return null when platform manifest is missing', () => {
      Platform.OS = 'ios';
      Constants.platform = undefined;
      expect(getIosBuildNumber()).toBeNull();
    });

    it('should return null when ios manifest is missing', () => {
      Platform.OS = 'ios';
      Constants.platform = { android: { versionCode: 42 } };
      expect(getIosBuildNumber()).toBeNull();
    });
  });

  describe('getExpoSdkVersion', () => {
    it('should return the first supported SDK version', () => {
      expect(getExpoSdkVersion()).toBe('48.0.0');
    });

    it('should return null when supportedExpoSdks is empty or null', () => {
      Constants.supportedExpoSdks = [];
      expect(getExpoSdkVersion()).toBeNull();

      Constants.supportedExpoSdks = undefined;
      expect(getExpoSdkVersion()).toBeNull();
    });
  });

  describe('getGitCommitHash', () => {
    it('should return a 7-character substring of the commit hash', () => {
      expect(getGitCommitHash()).toBe('abcdefg');
    });

    it('should return the full hash if it is less than 7 characters', () => {
      if (Constants.expoConfig?.extra) {
        Constants.expoConfig.extra.commitHash = 'abc';
      }
      expect(getGitCommitHash()).toBe('abc');
    });

    it('should return null if commitHash is missing', () => {
      if (Constants.expoConfig?.extra) {
        Constants.expoConfig.extra.commitHash = undefined;
      }
      expect(getGitCommitHash()).toBeNull();
    });
  });

  describe('getBuildDate', () => {
    it('should format a valid date string correctly', () => {
      // 2023-01-01T12:00:00.000Z in local time.
      // We will mock Date to ensure consistent timezone output or test against expected format.
      // Since it depends on the local timezone, let's inject a predictable date
      const dateString = '2023-01-01T12:00:00.000Z';
      if (Constants.expoConfig?.extra) {
        Constants.expoConfig.extra.buildDate = dateString;
      }

      const parsedDate = new Date(dateString);
      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getDate()).padStart(2, '0');
      const hour = String(parsedDate.getHours()).padStart(2, '0');
      const minute = String(parsedDate.getMinutes()).padStart(2, '0');

      const expected = `${year}-${month}-${day} ${hour}:${minute}`;

      expect(getBuildDate()).toBe(expected);
    });

    it('should return the raw string if date parsing throws an error', () => {
      // Date parsing only throws in very specific environments, usually it returns "Invalid Date"
      // But we can test with an invalid date string which results in Invalid Date.
      // Wait, in buildInfo.ts:
      // try {
      //   const date = new Date(buildDate);
      //   return formatBuildDate(date);
      // } catch {
      //   return buildDate;
      // }
      // The Date constructor doesn't throw on invalid strings, it creates a Date object with NaN time.
      // But formatBuildDate will return NaN-NaN-NaN NaN:NaN.
      // Let's spy on Date to make it throw
      const originalDate = global.Date;
      try {
        const mockDate = jest.fn().mockImplementation(() => {
          throw new Error('Fake Error');
        });
        global.Date = mockDate as any;

        if (Constants.expoConfig?.extra) {
          Constants.expoConfig.extra.buildDate = 'invalid date';
        }

        expect(getBuildDate()).toBe('invalid date');
      } finally {
        global.Date = originalDate;
      }
    });

    it('should return null if buildDate is missing', () => {
      if (Constants.expoConfig?.extra) {
        Constants.expoConfig.extra.buildDate = undefined;
      }
      expect(getBuildDate()).toBeNull();
    });
  });
});
