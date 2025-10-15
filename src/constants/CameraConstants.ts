/**
 * CameraScreen related constants
 * Centralizes all magic numbers and configuration values
 */

export const CAMERA_CONSTANTS = {
  PERMISSION_TIMEOUT_MS: 10000,
  PHOTO_QUALITY: 0.8,
  CAMERA_BUTTON_SIZE: 80,
  FOCUS_AREA_RATIO: 0.8,
  BOTTOM_BAR_PADDING: 50,
} as const;

export const ROUTE_NAMES = {
  CAMERA: 'Camera',
  RECORDS: 'Records',
  SETTINGS: 'Settings',
} as const;

// Platform-specific configurations
type PlatformConfig = {
  topBarMarginTop: number;
  bottomBarMarginBottom: number;
  safeAreaEdges: readonly ('top' | 'bottom' | 'left' | 'right')[];
};

export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  ios: {
    topBarMarginTop: 0, // SafeArea handles this
    bottomBarMarginBottom: 0, // SafeArea handles this
    safeAreaEdges: ['top', 'bottom'],
  },
  android: {
    topBarMarginTop: 0, // Override for consistency with Platform.select expectations
    bottomBarMarginBottom: 0, // Override for consistency with Platform.select expectations
    safeAreaEdges: ['top'],
  },
  default: {
    topBarMarginTop: 0,
    bottomBarMarginBottom: 0,
    safeAreaEdges: [],
  },
};
