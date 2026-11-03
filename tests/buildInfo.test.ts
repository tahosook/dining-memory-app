import {
  getBuildEnvironment,
  getAppVersion,
  getAndroidVersionCode,
  getIosBuildNumber,
  getExpoSdkVersion,
  getGitCommitHash,
  getBuildDate,
  getRuntimeVersion,
  getUpdateChannel,
  getUpdateSummary,
  isUpdatesEnabled,
  checkAndApplyOtaUpdate,
} from '../src/utils/buildInfo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Updates from 'expo-updates';
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

describe('buildInfo utilities', () => {
  let originalExpoConfig: any;
  let originalPlatform: any;
  let originalSupportedExpoSdks: any;
  let originalExecutionEnvironment: any;
  let originalOS: any;

  beforeEach(() => {
    originalExpoConfig = JSON.parse(JSON.stringify(mockExpoConfig));
    originalPlatform = JSON.parse(JSON.stringify(Constants.platform));
    originalSupportedExpoSdks = [...Constants.supportedExpoSdks!];
    originalExecutionEnvironment = Constants.executionEnvironment;
    originalOS = Platform.OS;
    Platform.OS = 'ios';
  });

  afterEach(() => {
    jest.clearAllMocks();
    Constants.executionEnvironment = originalExecutionEnvironment;
    Platform.OS = originalOS;
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

  describe('EAS Update helpers', () => {
    afterEach(() => {
      (Updates as any).__resetMockUpdates?.();
      jest.clearAllMocks();
    });

    describe('getRuntimeVersion', () => {
      it('should return Updates.runtimeVersion when available', () => {
        (Updates as any).__setMockUpdates({ runtimeVersion: '1.0.0-rc1' });
        expect(getRuntimeVersion()).toBe('1.0.0-rc1');
      });

      it('should fallback to Constants.expoConfig.runtimeVersion when Updates.runtimeVersion is null', () => {
        (Updates as any).__setMockUpdates({ runtimeVersion: null });
        (mockExpoConfig as any).runtimeVersion = '1.0.0';
        expect(getRuntimeVersion()).toBe('1.0.0');
        delete (mockExpoConfig as any).runtimeVersion;
      });

      it('should return null when runtimeVersion is undefined everywhere', () => {
        (Updates as any).__setMockUpdates({ runtimeVersion: null });
        delete (mockExpoConfig as any).runtimeVersion;
        expect(getRuntimeVersion()).toBeNull();
      });
    });

    describe('getUpdateChannel', () => {
      it('should return Updates.channel if present', () => {
        (Updates as any).__setMockUpdates({ channel: 'production' });
        expect(getUpdateChannel()).toBe('production');
      });

      it('should return null if Updates.channel is empty or null', () => {
        (Updates as any).__setMockUpdates({ channel: '' });
        expect(getUpdateChannel()).toBeNull();
        (Updates as any).__setMockUpdates({ channel: null });
        expect(getUpdateChannel()).toBeNull();
      });
    });

    describe('getUpdateSummary', () => {
      it('should return Disabled in dev or when disabled', () => {
        (Updates as any).__setMockUpdates({ isEnabled: false });
        expect(getUpdateSummary()).toBe('Disabled (開発環境)');
      });

      it('should return Embedded when isEmbeddedLaunch is true', () => {
        const originalDev = (global as any).__DEV__;
        (global as any).__DEV__ = false;
        try {
          (Updates as any).__setMockUpdates({
            isEnabled: true,
            isEmbeddedLaunch: true,
            updateId: null,
          });
          expect(getUpdateSummary()).toBe('Embedded (ビルド同梱)');
        } finally {
          (global as any).__DEV__ = originalDev;
        }
      });

      it('should return OTA with truncated updateId when updateId is present', () => {
        const originalDev = (global as any).__DEV__;
        (global as any).__DEV__ = false;
        try {
          (Updates as any).__setMockUpdates({
            isEnabled: true,
            isEmbeddedLaunch: false,
            updateId: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
          });
          expect(getUpdateSummary()).toBe('OTA (a1b2c3d4)');
        } finally {
          (global as any).__DEV__ = originalDev;
        }
      });
    });

    describe('isUpdatesEnabled', () => {
      it('should return false when __DEV__ is true even if Updates.isEnabled is true', () => {
        const originalDev = (global as any).__DEV__;
        (global as any).__DEV__ = true;
        try {
          (Updates as any).__setMockUpdates({ isEnabled: true });
          expect(isUpdatesEnabled()).toBe(false);
        } finally {
          (global as any).__DEV__ = originalDev;
        }
      });

      it('should return true when not in DEV and Updates.isEnabled is true', () => {
        const originalDev = (global as any).__DEV__;
        (global as any).__DEV__ = false;
        try {
          (Updates as any).__setMockUpdates({ isEnabled: true });
          expect(isUpdatesEnabled()).toBe(true);
        } finally {
          (global as any).__DEV__ = originalDev;
        }
      });
    });

    describe('checkAndApplyOtaUpdate', () => {
      it('should return disabled if not in standalone/enabled mode', async () => {
        const originalDev = (global as any).__DEV__;
        (global as any).__DEV__ = true;
        try {
          const res = await checkAndApplyOtaUpdate();
          expect(res).toEqual({ status: 'disabled' });
        } finally {
          (global as any).__DEV__ = originalDev;
        }
      });

      it('should return no_update when no update is available', async () => {
        const originalDev = (global as any).__DEV__;
        (global as any).__DEV__ = false;
        try {
          (Updates as any).__setMockUpdates({ isEnabled: true });
          (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValueOnce({ isAvailable: false });
          const res = await checkAndApplyOtaUpdate();
          expect(res).toEqual({ status: 'no_update' });
          expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
        } finally {
          (global as any).__DEV__ = originalDev;
        }
      });

      it('should fetch and reload when update is available', async () => {
        const originalDev = (global as any).__DEV__;
        (global as any).__DEV__ = false;
        try {
          (Updates as any).__setMockUpdates({ isEnabled: true });
          (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValueOnce({ isAvailable: true });
          (Updates.fetchUpdateAsync as jest.Mock).mockResolvedValueOnce({ isNew: true });
          (Updates.reloadAsync as jest.Mock).mockResolvedValueOnce(undefined);

          const res = await checkAndApplyOtaUpdate();
          expect(res).toEqual({ status: 'applied' });
          expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
          expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
        } finally {
          (global as any).__DEV__ = originalDev;
        }
      });

      it('should catch error and return descriptive object if check fails', async () => {
        const originalDev = (global as any).__DEV__;
        (global as any).__DEV__ = false;
        try {
          (Updates as any).__setMockUpdates({ isEnabled: true });
          (Updates.checkForUpdateAsync as jest.Mock).mockRejectedValueOnce(
            new Error('Network offline')
          );

          const res = await checkAndApplyOtaUpdate();
          expect(res).toEqual({ status: 'error', error: 'Network offline' });
        } finally {
          (global as any).__DEV__ = originalDev;
        }
      });
    });
  });
});
