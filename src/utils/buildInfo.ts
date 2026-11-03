import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

// Build environment detection
export function getBuildEnvironment(): 'development' | 'preview' | 'production' {
  if (__DEV__) {
    return 'development';
  }

  // Check if we're in a standalone build (production) or development build
  const isStandalone = Constants.executionEnvironment === ExecutionEnvironment.Standalone;
  return isStandalone ? 'production' : 'preview';
}

// App version from expo config
export function getAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

// Android versionCode - from expo-constants platform object
export function getAndroidVersionCode(): number | null {
  if (Platform.OS === 'android') {
    const platformManifest = Constants.platform;
    if (platformManifest && 'android' in platformManifest) {
      return (
        (platformManifest as { android?: { versionCode?: number } }).android?.versionCode ?? null
      );
    }
  }
  return null;
}

// iOS build number
export function getIosBuildNumber(): string | null {
  if (Platform.OS === 'ios') {
    const platformManifest = Constants.platform;
    if (platformManifest && 'ios' in platformManifest) {
      return (platformManifest as { ios?: { buildNumber?: string } }).ios?.buildNumber ?? null;
    }
  }
  return null;
}

// Expo SDK version - from supportedExpoSdks
export function getExpoSdkVersion(): string | null {
  const sdks = Constants.supportedExpoSdks;
  return sdks && sdks.length > 0 ? sdks[0] : null;
}

// Git commit hash from extra (injected at build time via app.config.js)
export function getGitCommitHash(): string | null {
  const commit = Constants.expoConfig?.extra?.commitHash;
  if (typeof commit === 'string' && commit.length >= 7) {
    return commit.substring(0, 7);
  }
  return commit ?? null;
}

// Build date from extra (injected at build time via app.config.js)
export function getBuildDate(): string | null {
  const buildDate = Constants.expoConfig?.extra?.buildDate;
  if (typeof buildDate === 'string') {
    try {
      const date = new Date(buildDate);
      return formatBuildDate(date);
    } catch {
      return buildDate;
    }
  }
  return null;
}

function formatBuildDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

// EAS Update runtime version
export function getRuntimeVersion(): string | null {
  if (Updates.runtimeVersion) {
    return Updates.runtimeVersion;
  }
  const configRuntime = Constants.expoConfig?.runtimeVersion;
  if (typeof configRuntime === 'string') {
    return configRuntime;
  }
  return null;
}

// EAS Update channel
export function getUpdateChannel(): string | null {
  return Updates.channel || null;
}

// EAS Update launch summary
export function getUpdateSummary(): string {
  if (__DEV__ || !Updates.isEnabled) {
    return 'Disabled (開発環境)';
  }
  if (Updates.isEmbeddedLaunch) {
    return 'Embedded (ビルド同梱)';
  }
  if (Updates.updateId) {
    return `OTA (${Updates.updateId.substring(0, 8)})`;
  }
  return 'Embedded (ビルド同梱)';
}

// Check if OTA update is enabled in current runtime
export function isUpdatesEnabled(): boolean {
  return Updates.isEnabled && !__DEV__;
}

// Manual check and apply OTA update helper
export async function checkAndApplyOtaUpdate(): Promise<{
  status: 'no_update' | 'applied' | 'disabled';
  error?: string;
}> {
  if (!isUpdatesEnabled()) {
    return { status: 'disabled' };
  }

  try {
    const update = await Updates.checkForUpdateAsync();
    if (!update.isAvailable) {
      return { status: 'no_update' };
    }
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return { status: 'applied' };
  } catch (error) {
    return {
      status: 'no_update',
      error: error instanceof Error ? error.message : '更新の確認中にエラーが発生しました。',
    };
  }
}
