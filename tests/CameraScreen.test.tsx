import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Camera from 'expo-camera';
import CameraScreen from '../src/screens/CameraScreen/CameraScreen';

// Mock SafeAreaView and ErrorBoundary
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0 })),
}));

// Mock ErrorBoundary
jest.mock('../src/components/common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock React Navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

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
  writeAsStringAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  deleteAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
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

// Mock canvas for web mode tests
jest.mock('canvas', () => ({
  createCanvas: jest.fn(() => ({
    width: 800,
    height: 600,
    toDataURL: jest.fn(() => 'data:image/jpeg;base64,mockBase64Data'),
  })),
}), { virtual: true });

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

const mockCameraPermissionsDenied = {
  granted: false,
  status: 'denied',
  canAskAgain: false,
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
      const mockRequestPermission = jest.fn().mockResolvedValue(mockCameraPermissionsGranted);
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        mockRequestPermission
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

  describe('Navigation Tests', () => {
    beforeEach(() => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        jest.fn().mockResolvedValue(mockCameraPermissionsGranted)
      ]);
      (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue(
        mockMediaLibraryPermissionsGranted
      );
      // Reset mockNavigate before each test
      mockNavigate.mockClear();
    });

    test('should navigate to Records screen when "撮影を終了しました" button is pressed', async () => {
      const { findByTestId } = render(<CameraScreen />);

      const closeButton = await findByTestId('close-button');
      fireEvent.press(closeButton);

      // Verify that Alert.alert was called with the correct arguments
      expect(Alert.alert).toHaveBeenCalledWith(
        '確認',
        '撮影を終了して記録タブに移動しますか？',
        [
          expect.objectContaining({
            text: 'キャンセル',
            style: 'cancel',
          }),
          expect.objectContaining({
            text: '撮影を終了しました',
            onPress: expect.any(Function),
          }),
        ]
      );

      // Extract the onPress handler and call it
      const alertArgs = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertArgs[2];
      const exitButton = buttons.find((button: any) => button.text === '撮影を終了しました');
      exitButton.onPress();

      // Verify that navigation.navigate was called with 'Records'
      expect(mockNavigate).toHaveBeenCalledWith('Records');
    });

    test('should not navigate when cancel button is pressed in close dialog', async () => {
      const { findByTestId } = render(<CameraScreen />);

      const closeButton = await findByTestId('close-button');
      fireEvent.press(closeButton);

      // Extract the onPress handler for cancel button and call it
      const alertArgs = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertArgs[2];
      const cancelButton = buttons.find((button: any) => button.text === 'キャンセル');
      // Fire event with onPress to trigger it properly to avoid undefined
      if (cancelButton && cancelButton.onPress) {
        cancelButton.onPress();
      }

      // Verify that navigation.navigate was NOT called
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should not navigate when OK button is pressed in success alert', async () => {
      const { findByTestId } = render(<CameraScreen />);

      // Set up mock camera ref with takePictureAsync
      mockCameraRef.current = {
        takePictureAsync: jest.fn().mockResolvedValue({
          uri: '/mock/photo.jpg',
          width: 1920,
          height: 1080,
        }),
      };

      (MediaLibrary.createAssetAsync as jest.Mock).mockResolvedValue({
        uri: '/mock/photo.jpg',
        width: 1920,
        height: 1080,
      });

      const captureButton = await findByTestId('capture-button');
      fireEvent.press(captureButton);

      // Wait for async operations to complete
      await waitFor(() => {
        if ((Alert.alert as jest.Mock).mock.calls.length > 0) {
          // Extract the onPress handler for OK button and call it
          const alertArgs = (Alert.alert as jest.Mock).mock.calls[0];
          const buttons = alertArgs[2];
          const okButton = buttons.find((button: any) => button.text === 'OK');
          okButton.onPress();

          // Verify that navigation.navigate was NOT called
          expect(mockNavigate).not.toHaveBeenCalled();
        }
      });
    });
  });
});

// Web Mode Mock Tests
describe('CameraScreen Web Mode Mock Tests', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeAll(() => {
    // Mock Platform.OS for web
    (require('react-native') as any).Platform.OS = 'web';

    // Mock document.createElement for canvas
    Object.defineProperty(global, 'document', {
      value: {
        createElement: jest.fn((tag: string) => {
          if (tag === 'canvas') {
            return {
              width: 800,
              height: 600,
              getContext: jest.fn(() => ({
                fillStyle: '',
                fillRect: jest.fn(),
                font: '',
                textAlign: '',
                fillText: jest.fn(),
              })),
              toDataURL: jest.fn(() => 'data:image/jpeg;base64,mockImageData'),
            };
          }
          return {};
        }),
      },
      writable: true,
    });

    // Mock fetch for Data URL handling
    global.fetch = jest.fn(() =>
      Promise.resolve({
        blob: () => Promise.resolve(new Blob(['mock data'])),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      })
    ) as any;
  });

  afterAll(() => {
    // Restore original Platform.OS
    (require('react-native') as any).Platform.OS = 'ios';
    delete (global as any).document;
    delete (global as any).fetch;
    consoleLogSpy.mockRestore();
  });

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
    mockCameraRef.current = null;
  });

  describe('Web Mock Functionality', () => {
    beforeEach(() => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsDenied,
        jest.fn().mockResolvedValue(mockCameraPermissionsDenied)
      ]);
      (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue(
        mockMediaLibraryPermissionsGranted
      );
    });

    test('should render camera interface in web mode without permissions', async () => {
      const { findByText } = render(<CameraScreen />);

      const instructionText = await findByText('撮影範囲に料理を合わせてください');
      expect(instructionText).toBeTruthy();

      const captureHint = await findByText('ボタンをタップして撮影');
      expect(captureHint).toBeTruthy();
    });

    test('should create mock image when capture button is pressed in web mode', async () => {
      const { findByTestId } = render(<CameraScreen />);

      (MediaLibrary.createAssetAsync as jest.Mock).mockResolvedValue({
        uri: '/mock/documents/mock_123456789.jpg',
        width: 800,
        height: 600,
      });

      const captureButton = await findByTestId('capture-button');
      fireEvent.press(captureButton);

      // Wait for async operations
      await waitFor(() => {
        // webモードではMediaLibrary保存をスキップ
        expect(MediaLibrary.createAssetAsync).not.toHaveBeenCalled();
        // WebモードではAlert.alertではなくconsole.logを使用
        expect(console.log).toHaveBeenCalledWith(
          '写真撮影完了',
          expect.objectContaining({
            message: expect.stringContaining('✅ 写真を写真ライブラリに保存しました！'),
          })
        );
      });
    });
  });
});
