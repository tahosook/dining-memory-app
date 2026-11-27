import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { CameraView as CameraViewType } from 'expo-camera';
import { PermissionStatus } from 'expo-modules-core';
import {
  buildMealInputAssistUiProps,
  type MealInputAssistHookLike,
  type MealInputAssistUiProps,
} from '../src/components/common/MealInputAssistSection';
import CameraView, { type CameraViewProps } from '../src/components/screens/camera/CameraView';
import { CaptureReview } from '../src/components/screens/camera/CaptureReview';
import type { CaptureReviewState } from '../src/hooks/cameraCapture/useCameraCapture';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0 })),
}));

jest.mock('../src/components/common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-camera', () => {
  const ReactModule = require('react');

  return {
    CameraView: jest.fn(({ children, ...props }) =>
      ReactModule.createElement('View', { ...props, testID: 'camera-view' }, children)
    ),
  };
});

function createCaptureReview(overrides: Partial<CaptureReviewState> = {}): CaptureReviewState {
  return {
    source: 'camera',
    photoUri: 'file:///photos/meal.jpg',
    width: 1080,
    height: 1440,
    capturedAtMs: 1700000000000,
    mealName: '',
    cuisineType: '',
    locationName: '',
    notes: '',
    isHomemade: false,
    ...overrides,
  };
}

function createAiAssistUiProps(
  overrides: Partial<MealInputAssistUiProps> = {}
): MealInputAssistUiProps {
  return {
    status: 'idle',
    suggestions: {
      source: 'local',
      noteDraft: null,
      mealNames: [],
      cuisineTypes: [],
    },
    errorMessage: null,
    progress: null,
    disabledReason: null,
    onRequestSuggestions: jest.fn().mockResolvedValue(undefined),
    onApplyNoteDraftSuggestion: jest.fn(),
    onApplyMealNameSuggestion: jest.fn(),
    onApplyCuisineSuggestion: jest.fn(),
    ...overrides,
  };
}

describe('buildMealInputAssistUiProps', () => {
  test('maps all status fields and handlers into MealInputAssistUiProps', () => {
    const requestSuggestions = jest.fn().mockResolvedValue(undefined);
    const applyNoteDraftSuggestion = jest.fn();
    const applyMealNameSuggestion = jest.fn();
    const applyCuisineSuggestion = jest.fn();

    const hookResult: MealInputAssistHookLike = {
      status: 'success',
      suggestions: {
        source: 'mediapipe',
        noteDraft: { value: 'サクサクの天ぷら定食', label: '下書き', source: 'mediapipe' },
        mealNames: [{ value: '天ぷら定食', label: '天ぷら定食', source: 'mediapipe' }],
        cuisineTypes: [{ value: '和食', label: '和食', source: 'mediapipe' }],
      },
      errorMessage: null,
      progress: {
        stage: 'finalizing',
        message: '仕上げ中',
        progress: 0.9,
        elapsedMs: 1200,
        estimatedRemainingMs: 100,
      },
      disabledReason: null,
      requestSuggestions,
      applyNoteDraftSuggestion,
      applyMealNameSuggestion,
      applyCuisineSuggestion,
    };

    const uiProps = buildMealInputAssistUiProps(hookResult);

    expect(uiProps).toEqual({
      status: 'success',
      suggestions: hookResult.suggestions,
      errorMessage: null,
      progress: hookResult.progress,
      disabledReason: null,
      onRequestSuggestions: requestSuggestions,
      onApplyNoteDraftSuggestion: applyNoteDraftSuggestion,
      onApplyMealNameSuggestion: applyMealNameSuggestion,
      onApplyCuisineSuggestion: applyCuisineSuggestion,
    });
  });

  test('preserves undefined optional meal name and cuisine apply handlers', () => {
    const hookResult: MealInputAssistHookLike = {
      status: 'disabled',
      suggestions: {
        source: 'disabled',
        noteDraft: null,
        mealNames: [],
        cuisineTypes: [],
      },
      errorMessage: null,
      progress: null,
      disabledReason: 'モデル未導入',
      requestSuggestions: jest.fn().mockResolvedValue(undefined),
      applyNoteDraftSuggestion: jest.fn(),
    };

    const uiProps = buildMealInputAssistUiProps(hookResult);

    expect(uiProps.disabledReason).toBe('モデル未導入');
    expect(uiProps.onApplyMealNameSuggestion).toBeUndefined();
    expect(uiProps.onApplyCuisineSuggestion).toBeUndefined();
  });
});

describe('CaptureReview', () => {
  test('expands location and notes inputs automatically when initial values are non-empty', () => {
    const { getByTestId, queryByTestId } = render(
      <CaptureReview
        captureReview={createCaptureReview({
          locationName: '駅前食堂',
          notes: '日替わりランチ',
        })}
        savingCapture={false}
        aiAssist={createAiAssistUiProps()}
        onChange={jest.fn()}
        onCancel={jest.fn()}
        onSave={jest.fn().mockResolvedValue(undefined)}
      />
    );

    expect(getByTestId('location-input').props.value).toBe('駅前食堂');
    expect(getByTestId('notes-input').props.value).toBe('日替わりランチ');
    expect(queryByTestId('location-input-trigger')).toBeNull();
    expect(queryByTestId('notes-input-trigger')).toBeNull();
  });

  test('passes bundled aiAssist props to MealInputAssistSection', () => {
    const onRequestSuggestions = jest.fn().mockResolvedValue(undefined);
    const onApplyNoteDraftSuggestion = jest.fn();

    const { getByTestId } = render(
      <CaptureReview
        captureReview={createCaptureReview()}
        savingCapture={false}
        aiAssist={createAiAssistUiProps({
          status: 'success',
          suggestions: {
            source: 'mediapipe',
            noteDraft: { value: '濃厚な味噌ラーメン', label: '下書き', source: 'mediapipe' },
            mealNames: [],
            cuisineTypes: [],
          },
          onRequestSuggestions,
          onApplyNoteDraftSuggestion,
        })}
        onChange={jest.fn()}
        onCancel={jest.fn()}
        onSave={jest.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.press(getByTestId('ai-input-assist-button'));
    expect(onRequestSuggestions).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('ai-note-draft-apply-button'));
    expect(onApplyNoteDraftSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ value: '濃厚な味噌ラーメン' })
    );
  });
});

describe('CameraView boundaries', () => {
  const cameraRef: React.RefObject<CameraViewType | null> = { current: null };
  const grantedPermission = {
    granted: true,
    canAskAgain: true,
    expires: 'never' as const,
    status: PermissionStatus.GRANTED,
  };

  function createBaseProps(overrides: Partial<CameraViewProps> = {}): CameraViewProps {
    return {
      takingPhoto: false,
      pickingPhotoFromLibrary: false,
      facing: 'back',
      cameraRef,
      cameraPermission: grantedPermission,
      permissionUiState: 'granted',
      captureReview: null,
      savingCapture: false,
      aiAssist: createAiAssistUiProps(),
      onTakePicture: jest.fn().mockResolvedValue(undefined),
      onAddPhotoFromLibrary: jest.fn().mockResolvedValue(undefined),
      onFlipCamera: jest.fn(),
      onClose: jest.fn(),
      onRequestPermission: jest.fn().mockResolvedValue(undefined),
      onOpenSettings: jest.fn().mockResolvedValue(undefined),
      onCaptureReviewChange: jest.fn(),
      onCaptureReviewCancel: jest.fn(),
      onCaptureReviewSave: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  test('disables close button while savingCapture is true and keeps ExpoCameraView mounted', () => {
    const onClose = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <CameraView
        {...createBaseProps({
          captureReview: createCaptureReview(),
          savingCapture: true,
          onClose,
        })}
      />
    );

    const closeButton = getByTestId('close-button');
    expect(closeButton.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(closeButton);
    expect(onClose).not.toHaveBeenCalled();

    expect(getByTestId('camera-view')).toBeTruthy();
    expect(queryByTestId('add-photo-from-library-button')).toBeNull();
  });

  test('renders bottom library action and triggers handler when granted without review', () => {
    const onAddPhotoFromLibrary = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <CameraView
        {...createBaseProps({
          onAddPhotoFromLibrary,
        })}
      />
    );

    fireEvent.press(getByTestId('add-photo-from-library-button'));
    expect(onAddPhotoFromLibrary).toHaveBeenCalledTimes(1);
  });

  test('renders permission request and denied views via PermissionViews', () => {
    const onRequestPermission = jest.fn().mockResolvedValue(undefined);
    const onOpenSettings = jest.fn().mockResolvedValue(undefined);

    const requestView = render(
      <CameraView
        {...createBaseProps({
          permissionUiState: 'needs_request',
          onRequestPermission,
        })}
      />
    );
    fireEvent.press(requestView.getByTestId('request-camera-permission-button'));
    expect(onRequestPermission).toHaveBeenCalledTimes(1);

    const deniedView = render(
      <CameraView
        {...createBaseProps({
          permissionUiState: 'denied',
          onOpenSettings,
        })}
      />
    );
    fireEvent.press(deniedView.getByTestId('open-camera-settings-button'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
