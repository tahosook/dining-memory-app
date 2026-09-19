import { getMealListImageUri, getMealDetailImageUri } from '../src/utils/mealImage';

describe('mealImage helpers', () => {
  describe('getMealListImageUri', () => {
    test('returns thumbnail when photo_thumbnail_path is present', () => {
      const meal = {
        photo_path: 'file:///documents/meal-original.jpg',
        photo_thumbnail_path: 'file:///documents/meal-original-thumb.jpg',
      };
      expect(getMealListImageUri(meal)).toBe('file:///documents/meal-original-thumb.jpg');
    });

    test('falls back to photo_path when photo_thumbnail_path is missing', () => {
      const meal = {
        photo_path: 'file:///documents/meal-original.jpg',
        photo_thumbnail_path: undefined,
      };
      expect(getMealListImageUri(meal)).toBe('file:///documents/meal-original.jpg');
    });

    test('normalizes path without scheme by prepending file://', () => {
      const meal = {
        photo_path: '/documents/meal-original.jpg',
        photo_thumbnail_path: '/documents/meal-original-thumb.jpg',
      };
      expect(getMealListImageUri(meal)).toBe('file:///documents/meal-original-thumb.jpg');
    });

    test('returns undefined when both photo paths are empty', () => {
      const meal = {
        photo_path: '',
        photo_thumbnail_path: undefined,
      };
      expect(getMealListImageUri(meal)).toBeUndefined();
    });
  });

  describe('getMealDetailImageUri', () => {
    test('prefers original photo_path over photo_thumbnail_path', () => {
      const meal = {
        photo_path: 'file:///documents/meal-original.jpg',
        photo_thumbnail_path: 'file:///documents/meal-original-thumb.jpg',
      };
      expect(getMealDetailImageUri(meal)).toBe('file:///documents/meal-original.jpg');
    });

    test('falls back to photo_thumbnail_path when photo_path is undefined', () => {
      const meal = {
        photo_path: undefined as unknown as string,
        photo_thumbnail_path: 'file:///documents/meal-original-thumb.jpg',
      };
      expect(getMealDetailImageUri(meal)).toBe('file:///documents/meal-original-thumb.jpg');
    });

    test('returns undefined when both photo paths are empty', () => {
      const meal = {
        photo_path: '',
        photo_thumbnail_path: undefined,
      };
      expect(getMealDetailImageUri(meal)).toBeUndefined();
    });
  });
});
