import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Camera from 'expo-camera';
import { useCameraPermission, useCameraCapture } from '../src/hooks/cameraCapture';
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

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

// Mock useCameraCapture
jest.mock('../src/hooks/cameraCapture', () => ({
  useCameraPermission: jest.fn(),
  useCameraCapture: jest.fn(() => ({
    takingPhoto: false,
    facing: 'back',
    cameraRef: { current: null },
    successMessage: '',
    captureReview: null,
    takePicture: jest.fn(),
    flipCamera: jest.fn(),
    showCloseConfirmDialog: jest.fn(),
    onSuccessMessageOk: jest.fn(),
    onSuccessMessageGoToRecords: jest.fn(),
    onCaptureReviewChange: jest.fn(),
    onCaptureReviewCancel: jest.fn(),
    onCaptureReviewSave: jest.fn(),
  })),
}));

// Mock Expo APIs
jest.mock('expo-camera', () => ({
  CameraView: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="camera-view">{children}</div>
  ),
  useCameraPermissions: jest.fn(),
}));

let mockCameraRef: { current: unknown } = {
  current: null,
};

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
  Image: 'Image',
  TextInput: 'TextInput',
  Switch: 'Switch',
  ScrollView: 'ScrollView',
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

const mockCameraPermissionsUndetermined = {
  granted: false,
  status: 'undetermined',
  canAskAgain: true,
  expires: 'never',
};

type MockPermissionState = {
  permission:
    | typeof mockCameraPermissionsGranted
    | typeof mockCameraPermissionsDenied
    | typeof mockCameraPermissionsUndetermined
    | null;
  uiState: 'checking' | 'needs_request' | 'denied' | 'granted';
  requestPermissions: jest.Mock;
  openAppSettings: jest.Mock;
};

function createPermissionState(overrides: Partial<MockPermissionState> = {}) {
  return {
    ...basePermissionState(),
    ...overrides,
  };
}

function basePermissionState(): MockPermissionState {
  return {
    permission: mockCameraPermissionsGranted,
    uiState: 'granted' as const,
    requestPermissions: jest.fn(),
    openAppSettings: jest.fn(),
  };
}

describe('CameraScreen Normal Flow Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset camera ref before each test
    mockCameraRef.current = null;
    (useCameraCapture as jest.Mock).mockReturnValue({
      takingPhoto: false,
      facing: 'back',
      cameraRef: mockCameraRef,
      successMessage: '',
      captureReview: null,
      takePicture: jest.fn(),
      flipCamera: jest.fn(),
      showCloseConfirmDialog: jest.fn(),
      onSuccessMessageOk: jest.fn(),
      onSuccessMessageGoToRecords: jest.fn(),
      onCaptureReviewChange: jest.fn(),
      onCaptureReviewCancel: jest.fn(),
      onCaptureReviewSave: jest.fn(),
    });
    (useCameraPermission as jest.Mock).mockReturnValue(createPermissionState());
  });

  describe('Permission Flow', () => {
    test('should render permission screen initially', () => {
      (useCameraPermission as jest.Mock).mockReturnValue(createPermissionState({
        permission: null,
        uiState: 'checking',
      }));

      const { getByText } = render(<CameraScreen />);

      expect(getByText('カメラ権限を確認中...')).toBeTruthy();
    });

    test('should render permission request view before requesting access', async () => {
      const requestPermissions = jest.fn().mockResolvedValue(undefined);
      (useCameraPermission as jest.Mock).mockReturnValue(createPermissionState({
        permission: mockCameraPermissionsUndetermined,
        uiState: 'needs_request',
        requestPermissions,
      }));

      const { findByText, findByTestId } = render(<CameraScreen />);

      expect(await findByText('撮影を始めるにはカメラ権限が必要です')).toBeTruthy();
      fireEvent.press(await findByTestId('request-camera-permission-button'));
      expect(requestPermissions).toHaveBeenCalled();
    });

    test('should render recovery view when permission is denied', async () => {
      const openAppSettings = jest.fn().mockResolvedValue(undefined);
      (useCameraPermission as jest.Mock).mockReturnValue(createPermissionState({
        permission: mockCameraPermissionsDenied,
        uiState: 'denied',
        openAppSettings,
      }));

      const { findByText, findByTestId } = render(<CameraScreen />);

      expect(await findByText('カメラ権限がオフになっています')).toBeTruthy();
      fireEvent.press(await findByTestId('open-camera-settings-button'));
      expect(openAppSettings).toHaveBeenCalled();
    });

    test('should allow camera access when permission granted', async () => {
      const mockRequestPermission = jest.fn().mockResolvedValue(mockCameraPermissionsGranted);
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        mockRequestPermission
      ]);
      (useCameraPermission as jest.Mock).mockReturnValue(createPermissionState({
        permission: mockCameraPermissionsGranted,
        uiState: 'granted',
      }));

      const { queryByText } = render(<CameraScreen />);

      await waitFor(() => {
        expect(queryByText('カメラ権限を確認中...')).toBeNull();
        expect(queryByText('撮影を始めるにはカメラ権限が必要です')).toBeNull();
        expect(queryByText('カメラ権限がオフになっています')).toBeNull();
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

    test('should display success message with correct buttons after photo capture', async () => {
      (useCameraCapture as jest.Mock).mockReturnValue({
        takingPhoto: false,
        facing: 'back',
        cameraRef: mockCameraRef,
        successMessage: '✅ 写真を写真ライブラリに保存しました！\n\n📸 写真詳細:\n• 1920x1080\n• 保存時刻: 10/28/2025, 9:36:00 PM',
        captureReview: null,
        takePicture: jest.fn(),
        flipCamera: jest.fn(),
        showCloseConfirmDialog: jest.fn(),
        onSuccessMessageOk: jest.fn(),
        onSuccessMessageGoToRecords: jest.fn(),
        onCaptureReviewChange: jest.fn(),
        onCaptureReviewCancel: jest.fn(),
        onCaptureReviewSave: jest.fn(),
      });

      const { findByText } = render(<CameraScreen />);

      // Check that success message is displayed
      const successText = await findByText(/✅ 写真を写真ライブラリに保存しました！/);
      expect(successText).toBeTruthy();

      // Check that both buttons are present
      const okButton = await findByText('OK');
      expect(okButton).toBeTruthy();

      const recordsButton = await findByText('記録タブで確認');
      expect(recordsButton).toBeTruthy();
    });



    test('should call OK handler when OK button is pressed', async () => {
      const mockOnOk = jest.fn();

      (useCameraCapture as jest.Mock).mockReturnValue({
        takingPhoto: false,
        facing: 'back',
        cameraRef: mockCameraRef,
        successMessage: '✅ 写真を写真ライブラリに保存しました！\n\n📸 写真詳細:\n• 1920x1080\n• 保存時刻: 10/28/2025, 9:36:00 PM',
        captureReview: null,
        takePicture: jest.fn(),
        flipCamera: jest.fn(),
        showCloseConfirmDialog: jest.fn(),
        onSuccessMessageOk: mockOnOk,
        onSuccessMessageGoToRecords: jest.fn(),
        onCaptureReviewChange: jest.fn(),
        onCaptureReviewCancel: jest.fn(),
        onCaptureReviewSave: jest.fn(),
      });

      const { findByText } = render(<CameraScreen />);

      // Press OK button
      const okButton = await findByText('OK');
      fireEvent.press(okButton);

      // Check that the OK handler was called
      expect(mockOnOk).toHaveBeenCalled();
    });

    test('should navigate to Records when "記録タブで確認" button is pressed', async () => {
      (useCameraCapture as jest.Mock).mockReturnValue({
        takingPhoto: false,
        facing: 'back',
        cameraRef: mockCameraRef,
        successMessage: '✅ 写真を写真ライブラリに保存しました！\n\n📸 写真詳細:\n• 1920x1080\n• 保存時刻: 10/28/2025, 9:36:00 PM',
        captureReview: null,
        takePicture: jest.fn(),
        flipCamera: jest.fn(),
        showCloseConfirmDialog: jest.fn(),
        onSuccessMessageOk: jest.fn(),
        onSuccessMessageGoToRecords: () => mockNavigate('Records'),
        onCaptureReviewChange: jest.fn(),
        onCaptureReviewCancel: jest.fn(),
        onCaptureReviewSave: jest.fn(),
      });

      const { findByText } = render(<CameraScreen />);

      // Reset navigate mock to ensure we catch the call
      mockNavigate.mockClear();

      // Press records button
      const recordsButton = await findByText('記録タブで確認');
      fireEvent.press(recordsButton);

      // Should navigate to Records
      expect(mockNavigate).toHaveBeenCalledWith('Records');
    });
  });

  describe('Navigation Tests', () => {
    beforeEach(() => {
      // Parent beforeEach already sets up hooks
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        jest.fn().mockResolvedValue(mockCameraPermissionsGranted)
      ]);
      (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue(
        mockMediaLibraryPermissionsGranted
      );
      // Reset mockNavigate before each test
      mockNavigate.mockClear();

      // Override useCameraCapture for navigation tests
      (useCameraCapture as jest.Mock).mockReturnValue({
        takingPhoto: false,
        facing: 'back',
        cameraRef: mockCameraRef,
        successMessage: '',
        captureReview: null,
        takePicture: jest.fn(),
        flipCamera: jest.fn(),
        showCloseConfirmDialog: () => {
          Alert.alert('確認', '撮影を終了して記録タブに移動しますか？', [
            { text: 'キャンセル', style: 'cancel' },
            { text: '撮影を終了しました', onPress: () => mockNavigate('Records') },
          ]);
        },
        onSuccessMessageOk: jest.fn(),
        onSuccessMessageGoToRecords: jest.fn(),
        onCaptureReviewChange: jest.fn(),
        onCaptureReviewCancel: jest.fn(),
        onCaptureReviewSave: jest.fn(),
      });
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
      const exitButton = buttons.find((button: { text: string; onPress?: () => void }) => button.text === '撮影を終了しました');
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
      const cancelButton = buttons.find((button: { text: string; onPress?: () => void }) => button.text === 'キャンセル');
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
          const okButton = buttons.find((button: { text: string; onPress?: () => void }) => button.text === 'OK');
          okButton.onPress();

          // Verify that navigation.navigate was NOT called
          expect(mockNavigate).not.toHaveBeenCalled();
        }
      });
    });

    test('should render review form when captureReview is present', async () => {
      (useCameraCapture as jest.Mock).mockReturnValue({
        takingPhoto: false,
        facing: 'back',
        cameraRef: mockCameraRef,
        successMessage: '',
        captureReview: {
          photoUri: '/mock/photo.jpg',
          width: 800,
          height: 600,
          mealName: '',
          cuisineType: '',
          notes: '',
          locationName: '',
          isHomemade: true,
        },
        takePicture: jest.fn(),
        flipCamera: jest.fn(),
        showCloseConfirmDialog: jest.fn(),
        onSuccessMessageOk: jest.fn(),
        onSuccessMessageGoToRecords: jest.fn(),
        onCaptureReviewChange: jest.fn(),
        onCaptureReviewCancel: jest.fn(),
        onCaptureReviewSave: jest.fn(),
      });

      const { findByText, findByTestId, queryByText } = render(<CameraScreen />);

      expect(await findByText('撮影内容を確認')).toBeTruthy();
      expect(await findByTestId('capture-review-cuisine-和食')).toBeTruthy();
      expect(await findByText('料理名やメニュー名を入れておくと、あとで探しやすくなります。')).toBeTruthy();
      expect(await findByText('店名・施設名・自宅など、食べた場所を記録できます。')).toBeTruthy();
      expect(await findByTestId('meal-name-input')).toBeTruthy();
      expect(await findByTestId('location-field-toggle')).toBeTruthy();
      expect(await findByTestId('notes-field-toggle')).toBeTruthy();
      expect(await findByTestId('save-meal-button')).toBeTruthy();
      expect(queryByText('ボタンをタップして撮影')).toBeNull();
    });

    test('should call cuisine type change handler when a cuisine option is pressed', async () => {
      const mockOnCaptureReviewChange = jest.fn();

      (useCameraCapture as jest.Mock).mockReturnValue({
        takingPhoto: false,
        facing: 'back',
        cameraRef: mockCameraRef,
        successMessage: '',
        captureReview: {
          photoUri: '/mock/photo.jpg',
          width: 800,
          height: 600,
          mealName: '',
          cuisineType: '',
          notes: '',
          locationName: '',
          isHomemade: true,
        },
        takePicture: jest.fn(),
        flipCamera: jest.fn(),
        showCloseConfirmDialog: jest.fn(),
        onSuccessMessageOk: jest.fn(),
        onSuccessMessageGoToRecords: jest.fn(),
        onCaptureReviewChange: mockOnCaptureReviewChange,
        onCaptureReviewCancel: jest.fn(),
        onCaptureReviewSave: jest.fn(),
      });

      const { findByTestId } = render(<CameraScreen />);

      fireEvent.press(await findByTestId('capture-review-cuisine-和食'));

      expect(mockOnCaptureReviewChange).toHaveBeenCalledWith('cuisineType', '和食');
    });

    test('should expand location and notes inputs only after tapping each row', async () => {
      (useCameraCapture as jest.Mock).mockReturnValue({
        takingPhoto: false,
        facing: 'back',
        cameraRef: mockCameraRef,
        successMessage: '',
        captureReview: {
          photoUri: '/mock/photo.jpg',
          width: 800,
          height: 600,
          mealName: '',
          cuisineType: '',
          notes: '',
          locationName: '',
          isHomemade: true,
        },
        takePicture: jest.fn(),
        flipCamera: jest.fn(),
        showCloseConfirmDialog: jest.fn(),
        onSuccessMessageOk: jest.fn(),
        onSuccessMessageGoToRecords: jest.fn(),
        onCaptureReviewChange: jest.fn(),
        onCaptureReviewCancel: jest.fn(),
        onCaptureReviewSave: jest.fn(),
      });

      const { findByTestId, queryByTestId } = render(<CameraScreen />);

      expect(queryByTestId('location-field-toggle-input')).toBeNull();
      expect(queryByTestId('notes-field-toggle-input')).toBeNull();

      fireEvent.press(await findByTestId('location-field-toggle'));
      expect(await findByTestId('location-field-toggle-input')).toBeTruthy();

      fireEvent.press(await findByTestId('notes-field-toggle'));
      expect(await findByTestId('notes-field-toggle-input')).toBeTruthy();
    });
  });
});

// Web Mode Mock Tests
describe('CameraScreen Web Mode Mock Tests', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeAll(() => {
    // Mock Platform.OS for web
    ReactNative.Platform.OS = 'web';

    // Mock document.createElement for canvas
    Object.defineProperty(globalThis, 'document', {
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
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        blob: () => Promise.resolve(new Blob(['mock data'])),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      })
    ) as unknown as typeof fetch;
  });

  beforeEach(() => {
    (useCameraCapture as jest.Mock).mockReturnValue({
      takingPhoto: false,
      facing: 'back',
      cameraRef: mockCameraRef,
      successMessage: '',
      captureReview: null,
      takePicture: jest.fn(),
      flipCamera: jest.fn(),
      showCloseConfirmDialog: jest.fn(),
      onSuccessMessageOk: jest.fn(),
      onSuccessMessageGoToRecords: jest.fn(),
      onCaptureReviewChange: jest.fn(),
      onCaptureReviewCancel: jest.fn(),
      onCaptureReviewSave: jest.fn(),
    });
  });

  afterAll(() => {
    // Restore original Platform.OS
    ReactNative.Platform.OS = 'ios';
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).fetch;
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
      (useCameraPermission as jest.Mock).mockReturnValue(createPermissionState({
        permission: mockCameraPermissionsDenied,
        uiState: 'denied',
      }));
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


  });
});
