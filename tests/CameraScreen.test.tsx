import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Camera from 'expo-camera';
import CameraScreen from '../src/screens/CameraScreen/CameraScreen';

// Mock Expo APIs
jest.mock('expo-camera', () => ({
  CameraView: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="camera-view">{children}</div>
  ),
  useCameraPermissions: jest.fn(),
}));

// Mock useRef to control camera ref
let mockCameraRef: { current: any } = {
  current: null,
};

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useRef: jest.fn((initialValue) => {
    mockCameraRef = { current: initialValue };
    return mockCameraRef;
  }),
}));

jest.mock('expo-media-library', () => ({
  createAssetAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
  deleteAsync: jest.fn(),
}));

// Mock React Native modules more comprehensively
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
  Platform: {
    OS: 'ios',
    select: jest.fn(),
  },
  Dimensions: {
    get: jest.fn(() => ({
      width: 375,
      height: 812,
    })),
  },
  StyleSheet: {
    create: jest.fn((styles) => styles),
    flatten: jest.fn((styles) => styles),
  },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  // Mock DevMenu and related modules that cause issues in tests
  DevMenu: {
    show: jest.fn(),
    hide: jest.fn(),
  },
  NativeModules: {
    DevMenu: {
      show: jest.fn(),
      hide: jest.fn(),
    },
  },
  // Mock TurboModuleRegistry to handle DevMenu requests
  TurboModuleRegistry: {
    getEnforcing: jest.fn((name: string) => {
      if (name === 'DevMenu') {
        return {
          show: jest.fn(),
          hide: jest.fn(),
        };
      }
      // For other modules, return empty object instead of throwing
      return {};
    }),
  },
}));

const mockCameraPermissionsGranted = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
  expires: 'never',
};

const mockMediaLibraryPermissionsGranted = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
  accessPrivileges: 'all',
  expires: 'never',
};

describe('CameraScreen Normal Flow Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset camera ref before each test
    mockCameraRef.current = null;
  });

  describe('Permission Flow', () => {
    test('should render permission screen initially', () => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([null, jest.fn()]);

      const { getByText } = render(<CameraScreen />);

      expect(getByText('カメラ権限を確認中...')).toBeTruthy();
    });

    test('should allow camera access when permission granted', async () => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        jest.fn().mockResolvedValue(mockCameraPermissionsGranted)
      ]);

      const { queryByText } = render(<CameraScreen />);

      await waitFor(() => {
        expect(queryByText('カメラ権限を確認中...')).toBeNull();
        expect(queryByText('カメラ権限がありません')).toBeNull();
      });
    });
  });

  describe('Camera Interface Tests', () => {
    beforeEach(() => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        jest.fn().mockResolvedValue(mockCameraPermissionsGranted)
      ]);
      (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue(
        mockMediaLibraryPermissionsGranted
      );
    });

    test('should render camera interface when permissions granted', async () => {
      const { findByText } = render(<CameraScreen />);

      const instructionText = await findByText('撮影範囲に料理を合わせてください');
      expect(instructionText).toBeTruthy();

      const captureHint = await findByText('ボタンをタップして撮影');
      expect(captureHint).toBeTruthy();
    });

    test('should render camera UI elements correctly', async () => {
      const { findByTestId, findByText } = render(<CameraScreen />);

      // Check that all UI elements are present
      const closeButton = await findByTestId('close-button');
      expect(closeButton).toBeTruthy();

      const captureButton = await findByTestId('capture-button');
      expect(captureButton).toBeTruthy();

      const instructionText = await findByText('撮影範囲に料理を合わせてください');
      expect(instructionText).toBeTruthy();

      const captureHint = await findByText('ボタンをタップして撮影');
      expect(captureHint).toBeTruthy();
    });
  });

  describe('UI Interaction Tests', () => {
    beforeEach(() => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        jest.fn().mockResolvedValue(mockCameraPermissionsGranted)
      ]);
      (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue(
        mockMediaLibraryPermissionsGranted
      );
    });

    test('should handle navigation button press correctly', async () => {
      const { findByTestId } = render(<CameraScreen />);

      const closeButton = await findByTestId('close-button');
      expect(closeButton).toBeTruthy();

      // Test that button press doesn't crash (Alert.alert is mocked)
      fireEvent.press(closeButton);
    });

    test('should render all camera control elements', async () => {
      const { findByTestId, findByText } = render(<CameraScreen />);

      // Check that all control elements are rendered
      await findByTestId('close-button');
      await findByTestId('capture-button');
      await findByText('撮影範囲に料理を合わせてください');
      await findByText('ボタンをタップして撮影');
    });
  });
});
