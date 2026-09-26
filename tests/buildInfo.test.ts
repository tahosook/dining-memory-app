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

const mockExpoConfig = {
  version: '1.0.0',
  extra: {
    commitHash: 'abcdefg',
    buildDate: '2023-01-01T12:00:00.000Z',
  },
};

jest.mock('expo-constants', () => {
  return {
    __esModule: true,
    default: {
      executionEnvironment: 'standalone',
      get expoConfig() {
        return mockExpoConfig;
      },
      set expoConfig(val) {
        // mock setter to allow assignments
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
  let originalExpoConfig: any;
  let originalPlatform: any;
  let originalSupportedExpoSdks: any;
  let originalExecutionEnvironment: any;

  beforeEach(() => {
    originalExpoConfig = JSON.parse(JSON.stringify(mockExpoConfig));
    originalPlatform = JSON.parse(JSON.stringify(Constants.platform));
    originalSupportedExpoSdks = [...Constants.supportedExpoSdks!];
    originalExecutionEnvironment = Constants.executionEnvironment;
  });

  afterEach(() => {
    jest.clearAllMocks();
    Constants.executionEnvironment = originalExecutionEnvironment;
    Platform.OS = 'ios';
    Constants.platform = originalPlatform;
    Constants.supportedExpoSdks = originalSupportedExpoSdks;

    // reset our mock
    Object.assign(mockExpoConfig, originalExpoConfig);
    // ensure extra is strictly equal to the original structure to avoid reference issues
    mockExpoConfig.extra = { ...originalExpoConfig.extra };
  });

  describe('getBuildEnvironment', () => {
    it('should return "development" when __DEV__ is true', () => {
      const originalDev = (global as any).__DEV__;
      (global as any).__DEV__ = true;
      expect(getBuildEnvironment()).toBe('development');
      (global as any).__DEV__ = originalDev;
    });

    it('should return "production" when executionEnvironment is Standalone and __DEV__ is false', () => {
      const originalDev = (global as any).__DEV__;
      (global as any).__DEV__ = false;
      Constants.executionEnvironment = ExecutionEnvironment.Standalone;
      expect(getBuildEnvironment()).toBe('production');
      (global as any).__DEV__ = originalDev;
    });

    it('should return "preview" when executionEnvironment is not Standalone and __DEV__ is false', () => {
      const originalDev = (global as any).__DEV__;
      (global as any).__DEV__ = false;
      Constants.executionEnvironment = ExecutionEnvironment.StoreClient;
      expect(getBuildEnvironment()).toBe('preview');
      (global as any).__DEV__ = originalDev;
    });
  });

  describe('getAppVersion', () => {
    it('should return the app version from expoConfig', () => {
      expect(getAppVersion()).toBe('1.0.0');
    });

    it('should return null if expoConfig or version is missing', () => {
      Object.defineProperty(Constants, 'expoConfig', { value: null, configurable: true });
      expect(getAppVersion()).toBeNull();
      // restore after test
      Object.defineProperty(Constants, 'expoConfig', {
        get: () => mockExpoConfig,
        configurable: true,
      });
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
      Constants.platform = { ios: { buildNumber: '100' } as any };
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
      mockExpoConfig.extra.commitHash = 'abc';
      expect(getGitCommitHash()).toBe('abc');
    });

    it('should return null if commitHash is missing', () => {
      mockExpoConfig.extra.commitHash = undefined as any;
      expect(getGitCommitHash()).toBeNull();
    });
  });

  describe('getBuildDate', () => {
    it('should format a valid date string correctly', () => {
      const dateString = '2023-01-01T12:00:00.000Z';
      mockExpoConfig.extra.buildDate = dateString;

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
      const originalDate = (global as any).Date;
      try {
        const mockDate = jest.fn().mockImplementation(() => {
          throw new Error('Fake Error');
        });
        (global as any).Date = mockDate as any;

        mockExpoConfig.extra.buildDate = 'invalid date';

        expect(getBuildDate()).toBe('invalid date');
      } finally {
        (global as any).Date = originalDate;
      }
    });

    it('should return null if buildDate is missing', () => {
      mockExpoConfig.extra.buildDate = undefined as any;
      expect(getBuildDate()).toBeNull();
    });
  });
});
