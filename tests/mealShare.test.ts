import { NativeModules, Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { getInfoAsync } from 'expo-file-system/legacy';
import {
  detectStorageLocation,
  inspectSharePhoto,
  shareMealContent,
} from '../src/media/mealShare';

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

describe('mealShare', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (getInfoAsync as jest.Mock).mockResolvedValue({
      exists: true,
      size: 102400,
    });
    (Share.share as jest.Mock) = jest.fn().mockResolvedValue({ action: 'sharedAction' });
    NativeModules.MealShare = undefined;
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
  });

  describe('detectStorageLocation', () => {
    test('identifies none for empty uri', () => {
      expect(detectStorageLocation(undefined)).toBe('none');
      expect(detectStorageLocation('')).toBe('none');
    });

    test('identifies mediaStore content URIs', () => {
      expect(detectStorageLocation('content://media/external/images/media/123')).toBe('mediaStore');
    });

    test('identifies cache paths', () => {
      expect(detectStorageLocation('file:///data/user/0/com.app/cache/temp.jpg')).toBe('cache');
    });

    test('identifies document paths', () => {
      expect(detectStorageLocation('file:///data/user/0/com.app/files/meal.jpg')).toBe('document');
    });

    test('identifies external paths', () => {
      expect(detectStorageLocation('file:///storage/emulated/0/photo.jpg')).toBe('external');
      expect(detectStorageLocation('/sdcard/photo.jpg')).toBe('external');
    });

    test('identifies unknown for other schemes', () => {
      expect(detectStorageLocation('custom://something')).toBe('unknown');
    });
  });

  describe('inspectSharePhoto', () => {
    test('inspects file info and populates debug info', async () => {
      const debugInfo = await inspectSharePhoto('file:///data/user/0/com.app/files/meal.jpg', 'image/jpeg');

      expect(debugInfo.exists).toBe(true);
      expect(debugInfo.fileSize).toBe(102400);
      expect(debugInfo.storageLocation).toBe('document');
      expect(debugInfo.mimeType).toBe('image/jpeg');
    });

    test('handles missing photo gracefully', async () => {
      const debugInfo = await inspectSharePhoto(undefined);

      expect(debugInfo.storageLocation).toBe('none');
      expect(debugInfo.fileSize).toBeUndefined();
    });
  });

  describe('shareMealContent on iOS', () => {
    beforeEach(() => {
      Platform.OS = 'ios';
    });

    test('shares text and image via Share.share on iOS', async () => {
      const result = await shareMealContent({
        title: 'ラーメン',
        text: '美味しいラーメンでした',
        photoUri: 'file:///data/user/0/com.app/files/ramen.jpg',
      });

      expect(Share.share).toHaveBeenCalledWith({
        title: 'ラーメン',
        message: '美味しいラーメンでした',
        url: 'file:///data/user/0/com.app/files/ramen.jpg',
      });
      expect(result.completed).toBe(true);
      expect(result.method).toBe('reactNativeShare');
    });
  });

  describe('shareMealContent on Android', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    test('uses MealShare native module when available', async () => {
      const mockShareMeal = jest.fn().mockResolvedValue({ success: true });
      NativeModules.MealShare = { shareMeal: mockShareMeal };

      const result = await shareMealContent({
        title: 'ラーメン',
        text: '美味しいラーメンでした',
        photoUri: 'file:///data/user/0/com.app/files/ramen.jpg',
      });

      expect(mockShareMeal).toHaveBeenCalledWith({
        title: '共有',
        text: '美味しいラーメンでした',
        photoUri: 'file:///data/user/0/com.app/files/ramen.jpg',
        mimeType: 'image/jpeg',
      });
      expect(result.completed).toBe(true);
      expect(result.method).toBe('mealShareNative');
    });

    test('falls back to expo-sharing when native module is missing and photo exists', async () => {
      NativeModules.MealShare = undefined;
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await shareMealContent({
        title: 'ラーメン',
        text: '美味しいラーメンでした',
        photoUri: 'file:///data/user/0/com.app/files/ramen.jpg',
      });

      expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///data/user/0/com.app/files/ramen.jpg', {
        dialogTitle: '共有',
        mimeType: 'image/jpeg',
      });
      expect(result.completed).toBe(true);
      expect(result.method).toBe('expoSharing');
    });

    test('falls back to standard Share.share when no photo exists', async () => {
      NativeModules.MealShare = undefined;

      const result = await shareMealContent({
        title: 'ラーメン',
        text: '美味しいラーメンでした',
      });

      expect(Share.share).toHaveBeenCalledWith(
        {
          title: 'ラーメン',
          message: '美味しいラーメンでした',
        },
        {
          dialogTitle: '共有',
        }
      );
      expect(result.completed).toBe(true);
      expect(result.method).toBe('reactNativeShare');
    });
  });
});
