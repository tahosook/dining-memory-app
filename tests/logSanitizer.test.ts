import { sanitizeUriForLog, sanitizeLogObject } from '../src/utils/logSanitizer';

describe('logSanitizer', () => {
  describe('sanitizeUriForLog', () => {
    it('returns undefined for empty or invalid inputs', () => {
      expect(sanitizeUriForLog(undefined)).toBeUndefined();
      expect(sanitizeUriForLog('')).toBeUndefined();
      expect(sanitizeUriForLog('   ')).toBeUndefined();
    });

    it('keeps content:// URIs as they do not contain personal paths', () => {
      const contentUri = 'content://media/external/images/media/1234';
      expect(sanitizeUriForLog(contentUri)).toBe(contentUri);
    });

    it('masks absolute file paths in URIs', () => {
      const fileUri = 'file:///data/user/0/com.example.app/files/meal-20231010-101010.jpg';
      expect(sanitizeUriForLog(fileUri)).toBe('file://.../meal-20231010-101010.jpg');
    });

    it('masks absolute file paths without file:// prefix', () => {
      const absolutePath = '/data/user/0/com.example.app/files/meal-20231010-101010.jpg';
      expect(sanitizeUriForLog(absolutePath)).toBe('[MASKED_PATH]/meal-20231010-101010.jpg');
    });

    it('handles paths with backslashes', () => {
      const absolutePath = 'C:\\Users\\user\\AppData\\Local\\meal-20231010-101010.jpg';
      expect(sanitizeUriForLog(absolutePath)).toBe('[MASKED_PATH]/meal-20231010-101010.jpg');
    });
  });

  describe('sanitizeLogObject', () => {
    it('returns the same value for non-objects', () => {
      expect(sanitizeLogObject(null)).toBeNull();
      expect(sanitizeLogObject(undefined)).toBeUndefined();
      expect(sanitizeLogObject(123)).toBe(123);
      expect(sanitizeLogObject(true)).toBe(true);
      expect(sanitizeLogObject('just a string')).toBe('just a string');
    });

    it('sanitizes string starting with file:// at root', () => {
      expect(sanitizeLogObject('file:///path/to/image.jpg')).toBe('file://.../image.jpg');
    });

    it('recursively sanitizes URI keys in objects', () => {
      const input = {
        id: 1,
        name: 'test',
        photoUri: 'file:///data/user/0/com.example/files/photo.jpg',
        details: {
          originalPath: '/data/user/0/com.example/files/original.jpg',
          resizedPhotoUri: 'file:///data/user/0/com.example/cache/resized.jpg',
          nested: {
            url: 'https://example.com/image.jpg'
          }
        },
        items: [
          { path: '/absolute/path/file1.txt' },
          { otherField: 'file:///should/not/be/sanitized/unless/matched.jpg' }
        ]
      };

      const sanitized = sanitizeLogObject(input);

      expect(sanitized).toEqual({
        id: 1,
        name: 'test',
        photoUri: 'file://.../photo.jpg',
        details: {
          originalPath: '[MASKED_PATH]/original.jpg',
          resizedPhotoUri: 'file://.../resized.jpg',
          nested: {
            url: '[MASKED_PATH]/image.jpg'
          }
        },
        items: [
          { path: '[MASKED_PATH]/file1.txt' },
          { otherField: 'file:///should/not/be/sanitized/unless/matched.jpg' }
        ]
      });
    });
  });
});
