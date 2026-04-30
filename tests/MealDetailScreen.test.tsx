import React from 'react';
import { Alert, Platform, Share } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Sharing from 'expo-sharing';
import { MealDetailScreen } from '../src/screens/RecordsScreen/MealDetailScreen';
import type { RecordsStackParamList } from '../src/navigation/types';
import { MealService } from '../src/database/services/MealService';
import { useMealInputAssist } from '../src/hooks/cameraCapture/useMealInputAssist';
import { rotateMealPhotoClockwise } from '../src/utils/mealPhotoRotation';

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    updateMeal: jest.fn(),
    softDeleteMeal: jest.fn(),
  },
}));

jest.mock('../src/hooks/cameraCapture/useMealInputAssist', () => ({
  useMealInputAssist: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('../src/utils/mealPhotoRotation', () => ({
  deleteMealPhotoFileIfSafe: jest.fn(() => Promise.resolve()),
  rotateMealPhotoClockwise: jest.fn(),
}));

type MealDetailProps = NativeStackScreenProps<RecordsStackParamList, 'MealDetail'>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const baseMeal = {
  id: 'meal-1',
  uuid: 'meal-1',
  meal_name: '焼き魚定食',
  meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime(),
  is_homemade: true,
  photo_path: 'file:///full-photo.jpg',
  photo_thumbnail_path: 'file:///thumb-photo.jpg',
  location_name: '自宅',
  cuisine_type: '和食',
  notes: '焼き加減がよかった',
  cooking_level: 'quick' as const,
  is_deleted: false,
  created_at: 1,
  updated_at: 1,
};

type MockAiAssistState = {
  status: 'idle' | 'running' | 'success' | 'error' | 'disabled';
  suggestions: {
    source: string;
    noteDraft: { value: string; label: string; confidence?: number; source: string } | null;
    mealNames: Array<{ value: string; label: string; confidence?: number; source: string }>;
    cuisineTypes: Array<{ value: string; label: string; confidence?: number; source: string }>;
  };
  errorMessage: string | null;
  progress: null;
  disabledReason: string | null;
  requestSuggestions: jest.Mock;
  applyNoteDraftSuggestion:
    | jest.Mock
    | ((suggestion: { value: string; label: string; confidence?: number; source: string }) => void);
};

function createAiAssistState(overrides: Partial<MockAiAssistState> = {}): MockAiAssistState {
  return {
    status: 'idle',
    suggestions: {
      source: 'mock-local',
      noteDraft: null,
      mealNames: [],
      cuisineTypes: [],
    },
    errorMessage: null,
    progress: null,
    disabledReason: null,
    requestSuggestions: jest.fn().mockResolvedValue(undefined),
    applyNoteDraftSuggestion: jest.fn(),
    ...overrides,
  };
}

function createProps(overrides: Partial<MealDetailProps> = {}): MealDetailProps {
  return {
    route: {
      key: 'MealDetail-test',
      name: 'MealDetail',
      params: {
        meal: baseMeal,
      },
    },
    navigation: {
      goBack: jest.fn(),
    } as unknown as MealDetailProps['navigation'],
    ...overrides,
  };
}

describe('MealDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
    jest.spyOn(Share, 'share').mockResolvedValue({
      action: Share.sharedAction,
    });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    (rotateMealPhotoClockwise as jest.Mock).mockResolvedValue('file:///rotated-photo.jpg');
    (useMealInputAssist as jest.Mock).mockReturnValue(createAiAssistState());
    Platform.OS = 'ios';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows the larger detail image using photo_path first', () => {
    const { getByTestId } = render(<MealDetailScreen {...createProps()} />);

    expect(getByTestId('meal-detail-image').props.source).toEqual({
      uri: 'file:///full-photo.jpg',
    });
  });

  test('shows homemade style labels and legacy values safely', () => {
    const firstRender = render(<MealDetailScreen {...createProps()} />);

    expect(firstRender.getByText('自炊スタイル')).toBeTruthy();
    expect(firstRender.getByText('時短')).toBeTruthy();

    firstRender.unmount();

    const secondRender = render(
      <MealDetailScreen
        {...createProps({
          route: {
            key: 'MealDetail-test',
            name: 'MealDetail',
            params: {
              meal: {
                ...baseMeal,
                cooking_level: 'hard' as unknown as typeof baseMeal.cooking_level,
              },
            },
          },
        })}
      />
    );

    expect(secondRender.getByText('本格')).toBeTruthy();
  });

  test('deletes the meal from the detail screen and returns to the list', async () => {
    const props = createProps();
    (MealService.softDeleteMeal as jest.Mock).mockResolvedValue(undefined);

    const { getByTestId } = render(<MealDetailScreen {...props} />);

    fireEvent.press(getByTestId('meal-detail-delete-button'));

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];

    await act(async () => {
      buttons.find(button => button.text === '削除')?.onPress?.();
    });

    expect(MealService.softDeleteMeal).toHaveBeenCalledWith('meal-1');
    expect(props.navigation.goBack).toHaveBeenCalled();
  });

  test('saves the selected homemade style from the edit modal', async () => {
    (MealService.updateMeal as jest.Mock).mockResolvedValue({
      ...baseMeal,
      cooking_level: 'gourmet',
    });

    const { getAllByText, getByTestId, getByText } = render(
      <MealDetailScreen {...createProps()} />
    );

    fireEvent.press(getByTestId('meal-detail-edit-button'));

    expect(getAllByText('自炊スタイル').length).toBeGreaterThan(0);
    expect(getByTestId('detail-edit-cooking-level-quick')).toBeTruthy();
    expect(getByText('日常')).toBeTruthy();
    expect(getByText('本格')).toBeTruthy();

    fireEvent.press(getByTestId('detail-edit-cooking-level-gourmet'));
    fireEvent.press(getByTestId('detail-edit-save-button'));

    await waitFor(() => {
      expect(MealService.updateMeal).toHaveBeenCalledWith(
        'meal-1',
        expect.objectContaining({
          cooking_level: 'gourmet',
        })
      );
    });
  });

  test('shows AI input assist in the edit modal and requests suggestions', () => {
    const requestSuggestions = jest.fn().mockResolvedValue(undefined);
    (useMealInputAssist as jest.Mock).mockReturnValue(
      createAiAssistState({
        requestSuggestions,
      })
    );

    const { getByTestId, getByText } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-edit-button'));

    expect(getByTestId('detail-edit-ai-input-assist-section')).toBeTruthy();
    expect(getByText('AIでメモを作成')).toBeTruthy();

    fireEvent.press(getByTestId('detail-edit-ai-input-assist-button'));

    expect(requestSuggestions).toHaveBeenCalledTimes(1);
  });

  test('appends an AI note draft to edit notes and saves it only through the save button', async () => {
    const noteDraft: NonNullable<MockAiAssistState['suggestions']['noteDraft']> = {
      value: '料理名: 焼き魚定食に見える\nメモ: 魚の焼き目がはっきりした定食',
      label: '料理名: 焼き魚定食に見える\nメモ: 魚の焼き目がはっきりした定食',
      confidence: 0.91,
      source: 'mock-local',
    };
    const applyNoteDraftSuggestion = jest.fn();
    (MealService.updateMeal as jest.Mock).mockResolvedValue({
      ...baseMeal,
      notes: `${baseMeal.notes}\n\n${noteDraft.value}`,
    });
    (useMealInputAssist as jest.Mock).mockImplementation(
      ({
        captureReview,
        onCaptureReviewChange,
      }: {
        captureReview: { notes: string } | null;
        onCaptureReviewChange: (field: 'notes', value: string) => void;
      }) =>
        createAiAssistState({
          status: 'success',
          suggestions: {
            source: 'mock-local',
            noteDraft,
            mealNames: [],
            cuisineTypes: [],
          },
          applyNoteDraftSuggestion: (suggestion: typeof noteDraft) => {
            applyNoteDraftSuggestion(suggestion);
            const trimmedNoteDraft = suggestion.value.trim();
            const currentNotes = captureReview?.notes.trim() ?? '';
            onCaptureReviewChange(
              'notes',
              currentNotes ? `${currentNotes}\n\n${trimmedNoteDraft}` : trimmedNoteDraft
            );
          },
        })
    );

    const { getByTestId } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-edit-button'));
    fireEvent.press(getByTestId('detail-edit-ai-note-draft-apply-button'));

    const expectedNotes = `${baseMeal.notes}\n\n${noteDraft.value}`;
    await waitFor(() => {
      expect(getByTestId('detail-edit-notes-input').props.value).toBe(expectedNotes);
    });

    expect(applyNoteDraftSuggestion).toHaveBeenCalledWith(noteDraft);
    expect(MealService.updateMeal).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('detail-edit-save-button'));

    await waitFor(() => {
      expect(MealService.updateMeal).toHaveBeenCalledWith(
        'meal-1',
        expect.objectContaining({
          notes: expectedNotes,
        })
      );
    });
  });

  test('hides AI input assist in the edit modal when the meal has no photo', () => {
    const props = createProps({
      route: {
        key: 'MealDetail-test',
        name: 'MealDetail',
        params: {
          meal: {
            ...baseMeal,
            photo_path: '',
            photo_thumbnail_path: undefined,
          },
        },
      },
    });

    const { getByTestId, queryByTestId } = render(<MealDetailScreen {...props} />);

    fireEvent.press(getByTestId('meal-detail-edit-button'));

    expect(queryByTestId('detail-edit-ai-input-assist-section')).toBeNull();
  });

  test('shows the saved image preview and rotate action in the edit modal', () => {
    const { getByTestId } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-edit-button'));

    expect(getByTestId('detail-edit-image-preview').props.source).toEqual({
      uri: 'file:///full-photo.jpg',
    });
    expect(getByTestId('detail-edit-rotate-image-button')).toBeTruthy();
  });

  test('rotates the current photo and refreshes the detail image', async () => {
    (rotateMealPhotoClockwise as jest.Mock).mockResolvedValue('file:///rotated-photo.jpg');
    (MealService.updateMeal as jest.Mock).mockResolvedValue({
      ...baseMeal,
      photo_path: 'file:///rotated-photo.jpg',
      photo_thumbnail_path: 'file:///rotated-photo.jpg',
    });

    const { getByTestId } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-edit-button'));
    fireEvent.press(getByTestId('detail-edit-rotate-image-button'));

    await waitFor(() => {
      expect(rotateMealPhotoClockwise).toHaveBeenCalledWith('file:///full-photo.jpg');
    });
    expect(MealService.updateMeal).toHaveBeenCalledWith('meal-1', {
      photo_path: 'file:///rotated-photo.jpg',
      photo_thumbnail_path: 'file:///rotated-photo.jpg',
    });
    await waitFor(() => {
      expect(getByTestId('meal-detail-image').props.source).toEqual({
        uri: 'file:///rotated-photo.jpg',
      });
    });
  });

  test('disables the rotate action while rotation is running', async () => {
    const deferred = createDeferred<string>();
    (rotateMealPhotoClockwise as jest.Mock).mockReturnValue(deferred.promise);
    (MealService.updateMeal as jest.Mock).mockResolvedValue({
      ...baseMeal,
      photo_path: 'file:///rotated-photo.jpg',
      photo_thumbnail_path: 'file:///rotated-photo.jpg',
    });

    const { findByText, getByTestId } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-edit-button'));
    fireEvent.press(getByTestId('detail-edit-rotate-image-button'));

    expect(await findByText('回転中...')).toBeTruthy();
    expect(getByTestId('detail-edit-rotate-image-button').props.accessibilityState?.disabled).toBe(
      true
    );

    fireEvent.press(getByTestId('detail-edit-rotate-image-button'));
    expect(rotateMealPhotoClockwise).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve('file:///rotated-photo.jpg');
      await Promise.resolve();
    });
  });

  test('shows an alert and keeps the meal unchanged when rotation fails', async () => {
    (rotateMealPhotoClockwise as jest.Mock).mockRejectedValue(new Error('rotate failed'));

    const { getByTestId } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-edit-button'));
    fireEvent.press(getByTestId('detail-edit-rotate-image-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('エラー', '写真の回転に失敗しました。');
    });
    expect(MealService.updateMeal).not.toHaveBeenCalled();
    expect(getByTestId('meal-detail-image').props.source).toEqual({
      uri: 'file:///full-photo.jpg',
    });
  });

  test('opens the share composer with photo preview and shares the edited text', async () => {
    const { getByTestId, getByText } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-share-button'));

    expect(getByText('共有する前に確認')).toBeTruthy();
    expect(getByTestId('share-preview-image').props.source).toEqual({
      uri: 'file:///full-photo.jpg',
    });

    fireEvent.changeText(
      getByTestId('share-text-input'),
      '食事記録: 焼き魚定食\n料理ジャンル: 和食'
    );
    fireEvent.press(getByTestId('share-submit-button'));

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalledWith({
        title: '焼き魚定食',
        message: '食事記録: 焼き魚定食\n料理ジャンル: 和食',
        url: 'file:///full-photo.jpg',
      });
    });
  });

  test('uses expo-sharing to attach the photo on Android', async () => {
    Platform.OS = 'android';

    const { getByTestId, getByText } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-share-button'));

    expect(getByText('共有する前に確認')).toBeTruthy();
    expect(getByText('写真を共有します。投稿文は共有先で調整できます。')).toBeTruthy();
    fireEvent.press(getByTestId('share-submit-button'));

    await waitFor(() => {
      expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///full-photo.jpg', {
        dialogTitle: '共有',
        mimeType: 'image/jpeg',
      });
    });
    expect(Share.share).not.toHaveBeenCalled();
  });

  test('falls back to the standard Android share sheet when there is no photo', async () => {
    Platform.OS = 'android';

    const props = createProps({
      route: {
        key: 'MealDetail-test',
        name: 'MealDetail',
        params: {
          meal: {
            ...baseMeal,
            photo_path: '',
            photo_thumbnail_path: undefined,
          },
        },
      },
    });

    const { getByTestId, queryByText } = render(<MealDetailScreen {...props} />);

    fireEvent.press(getByTestId('meal-detail-share-button'));

    expect(queryByText('写真を共有します。投稿文は共有先で調整できます。')).toBeNull();
    fireEvent.press(getByTestId('share-submit-button'));

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalledWith(
        {
          title: '焼き魚定食',
          message: '食事記録: 焼き魚定食\n料理ジャンル: 和食\n場所: 自宅',
        },
        {
          dialogTitle: '共有',
        }
      );
    });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
