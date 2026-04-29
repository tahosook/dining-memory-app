import React from 'react';
import { Alert, Platform, Share } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Sharing from 'expo-sharing';
import { MealDetailScreen } from '../src/screens/RecordsScreen/MealDetailScreen';
import type { RecordsStackParamList } from '../src/navigation/types';
import { MealService } from '../src/database/services/MealService';

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    updateMeal: jest.fn(),
    softDeleteMeal: jest.fn(),
  },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

type MealDetailProps = NativeStackScreenProps<RecordsStackParamList, 'MealDetail'>;

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
    jest.spyOn(Share, 'share').mockResolvedValue({
      action: Share.sharedAction,
    });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    Platform.OS = 'ios';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows the larger detail image using photo_path first', () => {
    const { getByTestId } = render(<MealDetailScreen {...createProps()} />);

    expect(getByTestId('meal-detail-image').props.source).toEqual({ uri: 'file:///full-photo.jpg' });
  });

  test('shows homemade style labels and legacy values safely', () => {
    const firstRender = render(<MealDetailScreen {...createProps()} />);

    expect(firstRender.getByText('自炊スタイル')).toBeTruthy();
    expect(firstRender.getByText('時短')).toBeTruthy();

    firstRender.unmount();

    const secondRender = render(<MealDetailScreen {...createProps({
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
    />);

    expect(secondRender.getByText('本格')).toBeTruthy();
  });

  test('deletes the meal from the detail screen and returns to the list', async () => {
    const props = createProps();
    (MealService.softDeleteMeal as jest.Mock).mockResolvedValue(undefined);

    const { getByTestId } = render(<MealDetailScreen {...props} />);

    fireEvent.press(getByTestId('meal-detail-delete-button'));

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];

    await act(async () => {
      buttons.find((button) => button.text === '削除')?.onPress?.();
    });

    expect(MealService.softDeleteMeal).toHaveBeenCalledWith('meal-1');
    expect(props.navigation.goBack).toHaveBeenCalled();
  });

  test('saves the selected homemade style from the edit modal', async () => {
    (MealService.updateMeal as jest.Mock).mockResolvedValue({
      ...baseMeal,
      cooking_level: 'gourmet',
    });

    const { getAllByText, getByTestId, getByText } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-edit-button'));

    expect(getAllByText('自炊スタイル').length).toBeGreaterThan(0);
    expect(getByTestId('detail-edit-cooking-level-quick')).toBeTruthy();
    expect(getByText('日常')).toBeTruthy();
    expect(getByText('本格')).toBeTruthy();

    fireEvent.press(getByTestId('detail-edit-cooking-level-gourmet'));
    fireEvent.press(getByTestId('detail-edit-save-button'));

    await waitFor(() => {
      expect(MealService.updateMeal).toHaveBeenCalledWith('meal-1', expect.objectContaining({
        cooking_level: 'gourmet',
      }));
    });
  });

  test('opens the share composer with photo preview and shares the edited text', async () => {
    const { getByTestId, getByText } = render(<MealDetailScreen {...createProps()} />);

    fireEvent.press(getByTestId('meal-detail-share-button'));

    expect(getByText('共有する前に確認')).toBeTruthy();
    expect(getByTestId('share-preview-image').props.source).toEqual({ uri: 'file:///full-photo.jpg' });

    fireEvent.changeText(getByTestId('share-text-input'), '食事記録: 焼き魚定食\n料理ジャンル: 和食');
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
