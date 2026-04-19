import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Camera from 'expo-camera';
import { useCameraPermission, useCameraCapture, useMealInputAssist } from '../src/hooks/cameraCapture';
import CameraScreen from '../src/screens/CameraScreen/CameraScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0 })),
}));

jest.mock('../src/components/common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/hooks/cameraCapture', () => ({
  useCameraPermission: jest.fn(),
  useCameraCapture: jest.fn(),
  useMealInputAssist: jest.fn(),
}));

jest.mock('expo-camera', () => ({
  CameraView: ({ children }: { children: React.ReactNode }) => <div data-testid="camera-view">{children}</div>,
  useCameraPermissions: jest.fn(),
}));

const mockCameraRef: { current: unknown } = {
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
  TurboModuleRegistry: {
    getEnforcing: jest.fn((name: string) => {
      if (name === 'DevMenu') {
        return {
          show: jest.fn(),
          hide: jest.fn(),
        };
      }

      return {};
    }),
  },
}));

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

type MockCaptureReview = {
  photoUri: string;
  width: number;
  height: number;
  mealName: string;
  cuisineType: string;
  notes: string;
  locationName: string;
  isHomemade: boolean;
};

type MockCaptureState = {
  takingPhoto: boolean;
  facing: 'front' | 'back';
  cameraRef: typeof mockCameraRef;
  captureReview: MockCaptureReview | null;
  takePicture: jest.Mock;
  flipCamera: jest.Mock;
  closeCamera: jest.Mock;
  onCaptureReviewChange: jest.Mock;
  onCaptureReviewCancel: jest.Mock;
  onCaptureReviewSave: jest.Mock;
};

type MockAiAssistState = {
  status: 'idle' | 'running' | 'success' | 'error' | 'disabled';
  suggestions: {
    source: string;
    mealNames: Array<{ value: string; label: string; confidence?: number; source: string }>;
    cuisineTypes: Array<{ value: string; label: string; confidence?: number; source: string }>;
    homemade: Array<{ value: boolean; label: '自炊' | '外食'; confidence?: number; source: string }>;
  };
  errorMessage: string | null;
  disabledReason: string | null;
  requestSuggestions: jest.Mock;
  applyMealNameSuggestion: jest.Mock;
  applyCuisineSuggestion: jest.Mock;
  applyHomemadeSuggestion: jest.Mock;
  appliedMetadata: {
    aiSource: string;
    aiConfidence?: number;
    appliedFields: string[];
  } | null;
};

function createPermissionState(overrides: Partial<MockPermissionState> = {}) {
  return {
    permission: mockCameraPermissionsGranted,
    uiState: 'granted' as const,
    requestPermissions: jest.fn(),
    openAppSettings: jest.fn(),
    ...overrides,
  };
}

function createCaptureReview(overrides: Partial<MockCaptureReview> = {}): MockCaptureReview {
  return {
    photoUri: '/mock/photo.jpg',
    width: 800,
    height: 600,
    mealName: '',
    cuisineType: '',
    notes: '',
    locationName: '',
    isHomemade: true,
    ...overrides,
  };
}

function createCaptureState(overrides: Partial<MockCaptureState> = {}): MockCaptureState {
  return {
    takingPhoto: false,
    facing: 'back',
    cameraRef: mockCameraRef,
    captureReview: null,
    takePicture: jest.fn(),
    flipCamera: jest.fn(),
    closeCamera: jest.fn(),
    onCaptureReviewChange: jest.fn(),
    onCaptureReviewCancel: jest.fn(),
    onCaptureReviewSave: jest.fn(),
    ...overrides,
  };
}

function createAiAssistState(overrides: Partial<MockAiAssistState> = {}): MockAiAssistState {
  return {
    status: 'idle',
    suggestions: {
      source: 'mock-local',
      mealNames: [],
      cuisineTypes: [],
      homemade: [],
    },
    errorMessage: null,
    disabledReason: null,
    requestSuggestions: jest.fn(),
    applyMealNameSuggestion: jest.fn(),
    applyCuisineSuggestion: jest.fn(),
    applyHomemadeSuggestion: jest.fn(),
    appliedMetadata: null,
    ...overrides,
  };
}

describe('CameraScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    mockCameraRef.current = null;
    (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState());
    (useCameraPermission as jest.Mock).mockReturnValue(createPermissionState());
    (useMealInputAssist as jest.Mock).mockReturnValue(createAiAssistState());
  });

  describe('Permission Flow', () => {
    test('renders permission screen initially', () => {
      (useCameraPermission as jest.Mock).mockReturnValue(createPermissionState({
        permission: null,
        uiState: 'checking',
      }));

      const { getByText } = render(<CameraScreen />);

      expect(getByText('カメラ権限を確認中...')).toBeTruthy();
    });

    test('renders permission request view before requesting access', async () => {
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

    test('renders recovery view when permission is denied', async () => {
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

    test('hides permission guidance after access is granted', async () => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        jest.fn().mockResolvedValue(mockCameraPermissionsGranted),
      ]);

      const { queryByText } = render(<CameraScreen />);

      await waitFor(() => {
        expect(queryByText('カメラ権限を確認中...')).toBeNull();
        expect(queryByText('撮影を始めるにはカメラ権限が必要です')).toBeNull();
        expect(queryByText('カメラ権限がオフになっています')).toBeNull();
      });
    });
  });

  describe('Camera Interface', () => {
    beforeEach(() => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        jest.fn().mockResolvedValue(mockCameraPermissionsGranted),
      ]);
      (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue(mockMediaLibraryPermissionsGranted);
    });

    test('renders the default camera guide', async () => {
      const { findByText, findByTestId } = render(<CameraScreen />);

      expect(await findByTestId('close-button')).toBeTruthy();
      expect(await findByTestId('capture-button')).toBeTruthy();
      expect(await findByText('撮影範囲に料理を合わせてください')).toBeTruthy();
      expect(await findByText('ボタンをタップして撮影')).toBeTruthy();
    });

    test('handles close button press without crashing', async () => {
      const { findByTestId } = render(<CameraScreen />);

      fireEvent.press(await findByTestId('close-button'));
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        jest.fn().mockResolvedValue(mockCameraPermissionsGranted),
      ]);
      (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue(mockMediaLibraryPermissionsGranted);
      const closeCamera = jest.fn(() => {
        mockNavigate('Records');
      });
      (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState({
        closeCamera,
      }));
    });

    test('navigates to Records immediately when the close button is pressed', async () => {
      const { findByTestId } = render(<CameraScreen />);

      fireEvent.press(await findByTestId('close-button'));

      expect(mockNavigate).toHaveBeenCalledWith('Records');
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  describe('Capture Review', () => {
    beforeEach(() => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
        mockCameraPermissionsGranted,
        jest.fn().mockResolvedValue(mockCameraPermissionsGranted),
      ]);
      (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue(mockMediaLibraryPermissionsGranted);
    });

    test('renders the simplified review form higher on the screen', async () => {
      (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState({
        captureReview: createCaptureReview(),
      }));

      const { findByText, findByTestId, queryByText } = render(<CameraScreen />);
      const reviewContainer = await findByTestId('capture-review-container');
      const mealNameInput = await findByTestId('meal-name-input');

      expect(await findByText('撮影内容を確認')).toBeTruthy();
      expect(reviewContainer.props.style.paddingTop).toBe(12);
      expect(await findByTestId('ai-input-assist-section')).toBeTruthy();
      expect((await findByTestId('ai-input-assist-status')).props.children).toBe('未実行');
      expect(await findByTestId('ai-input-assist-button')).toBeTruthy();
      expect(mealNameInput.props.placeholder).toBe('料理名（入力しない場合は自動で名前が付きます）');
      expect(await findByTestId('capture-review-cuisine-和食')).toBeTruthy();
      expect(await findByText('自炊')).toBeTruthy();
      expect(await findByTestId('location-input-trigger')).toBeTruthy();
      expect(await findByTestId('notes-input-trigger')).toBeTruthy();
      expect(await findByTestId('save-meal-button')).toBeTruthy();
      expect(queryByText('料理ジャンル')).toBeNull();
      expect(queryByText('料理名やメニュー名を入れておくと、あとで探しやすくなります。')).toBeNull();
      expect(queryByText('店名・施設名・自宅など、食べた場所を記録できます。')).toBeNull();
      expect(queryByText('ボタンをタップして撮影')).toBeNull();
    });

    test('calls cuisine type change handler when a cuisine option is pressed', async () => {
      const onCaptureReviewChange = jest.fn();
      (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState({
        captureReview: createCaptureReview(),
        onCaptureReviewChange,
      }));

      const { findByTestId } = render(<CameraScreen />);

      fireEvent.press(await findByTestId('capture-review-cuisine-和食'));

      expect(onCaptureReviewChange).toHaveBeenCalledWith('cuisineType', '和食');
    });

    test('reveals location and notes inputs with a single tap', async () => {
      (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState({
        captureReview: createCaptureReview(),
      }));

      const { findByTestId, queryByTestId } = render(<CameraScreen />);

      expect(queryByTestId('location-input')).toBeNull();
      expect(queryByTestId('notes-input')).toBeNull();

      fireEvent.press(await findByTestId('location-input-trigger'));
      fireEvent.press(await findByTestId('notes-input-trigger'));

      expect((await findByTestId('location-input')).props.placeholder).toBe('場所');
      expect((await findByTestId('notes-input')).props.placeholder).toBe('メモ');
    });

    test('requests AI suggestions when the assist button is pressed', async () => {
      const requestSuggestions = jest.fn().mockResolvedValue(undefined);
      (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState({
        captureReview: createCaptureReview(),
      }));
      (useMealInputAssist as jest.Mock).mockReturnValue(createAiAssistState({
        requestSuggestions,
      }));

      const { findByTestId } = render(<CameraScreen />);

      fireEvent.press(await findByTestId('ai-input-assist-button'));

      expect(requestSuggestions).toHaveBeenCalled();
    });

    test('calls the AI suggestion handlers when suggestion chips are tapped', async () => {
      const applyMealNameSuggestion = jest.fn();
      const applyCuisineSuggestion = jest.fn();
      const applyHomemadeSuggestion = jest.fn();
      (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState({
        captureReview: createCaptureReview(),
      }));
      (useMealInputAssist as jest.Mock).mockReturnValue(createAiAssistState({
        status: 'success',
        suggestions: {
          source: 'mock-local',
          mealNames: [{ value: '海鮮丼', label: '海鮮丼', confidence: 0.91, source: 'mock-local' }],
          cuisineTypes: [{ value: '和食', label: '和食', confidence: 0.8, source: 'mock-local' }],
          homemade: [{ value: false, label: '外食', confidence: 0.66, source: 'mock-local' }],
        },
        applyMealNameSuggestion,
        applyCuisineSuggestion,
        applyHomemadeSuggestion,
      }));

      const { findByTestId } = render(<CameraScreen />);

      fireEvent.press(await findByTestId('ai-meal-name-suggestion-0'));
      fireEvent.press(await findByTestId('ai-cuisine-suggestion-0'));
      fireEvent.press(await findByTestId('ai-homemade-suggestion-0'));

      expect(applyMealNameSuggestion).toHaveBeenCalledWith({
        value: '海鮮丼',
        label: '海鮮丼',
        confidence: 0.91,
        source: 'mock-local',
      });
      expect(applyCuisineSuggestion).toHaveBeenCalledWith({
        value: '和食',
        label: '和食',
        confidence: 0.8,
        source: 'mock-local',
      });
      expect(applyHomemadeSuggestion).toHaveBeenCalledWith({
        value: false,
        label: '外食',
        confidence: 0.66,
        source: 'mock-local',
      });
    });

    test('keeps the save button available when AI suggestion loading fails', async () => {
      (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState({
        captureReview: createCaptureReview(),
      }));
      (useMealInputAssist as jest.Mock).mockReturnValue(createAiAssistState({
        status: 'error',
        errorMessage: '候補を取得できませんでした。もう一度お試しください。',
      }));

      const { findByTestId, findByText } = render(<CameraScreen />);

      expect(await findByText('候補を取得できませんでした。もう一度お試しください。')).toBeTruthy();
      expect(await findByTestId('save-meal-button')).toBeTruthy();
    });

    test('shows the disabled reason when AI input assist is unavailable', async () => {
      (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState({
        captureReview: createCaptureReview(),
      }));
      (useMealInputAssist as jest.Mock).mockReturnValue(createAiAssistState({
        status: 'disabled',
        disabledReason: '設定画面でAI入力補助をオンにすると利用できます。',
      }));

      const { findByText, findByTestId } = render(<CameraScreen />);

      expect(await findByText('設定画面でAI入力補助をオンにすると利用できます。')).toBeTruthy();
      expect(await findByTestId('save-meal-button')).toBeTruthy();
    });

    test('passes applied AI metadata when the user saves the review', async () => {
      const onCaptureReviewSave = jest.fn().mockResolvedValue(undefined);
      (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState({
        captureReview: createCaptureReview(),
        onCaptureReviewSave,
      }));
      (useMealInputAssist as jest.Mock).mockReturnValue(createAiAssistState({
        appliedMetadata: {
          aiSource: 'mock-local',
          aiConfidence: 0.93,
          appliedFields: ['mealName'],
        },
      }));

      const { findByTestId } = render(<CameraScreen />);

      fireEvent.press(await findByTestId('save-meal-button'));

      expect(onCaptureReviewSave).toHaveBeenCalledWith({
        aiMetadata: {
          aiSource: 'mock-local',
          aiConfidence: 0.93,
          appliedFields: ['mealName'],
        },
      });
    });
  });
});

describe('CameraScreen Web Mode', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeAll(() => {
    ReactNative.Platform.OS = 'web';

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

    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        blob: () => Promise.resolve(new Blob(['mock data'])),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      })
    ) as unknown as typeof fetch;
  });

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
    mockCameraRef.current = null;
    (useCameraCapture as jest.Mock).mockReturnValue(createCaptureState());
    (useCameraPermission as jest.Mock).mockReturnValue(createPermissionState({
      permission: mockCameraPermissionsDenied,
      uiState: 'denied',
    }));
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      mockCameraPermissionsDenied,
      jest.fn().mockResolvedValue(mockCameraPermissionsDenied),
    ]);
    (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue(mockMediaLibraryPermissionsGranted);
  });

  afterAll(() => {
    ReactNative.Platform.OS = 'ios';
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).fetch;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('renders the camera guide in web mode without permissions', async () => {
    const { findByText } = render(<CameraScreen />);

    expect(await findByText('撮影範囲に料理を合わせてください')).toBeTruthy();
    expect(await findByText('ボタンをタップして撮影')).toBeTruthy();
  });
});
