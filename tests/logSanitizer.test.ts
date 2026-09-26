import { sanitizeUriForLog, sanitizeError, sanitizeLogContext } from '../src/utils/logSanitizer';

describe('logSanitizer', () => {
  describe('sanitizeUriForLog', () => {
    test('handles undefined and empty strings', () => {
      expect(sanitizeUriForLog(undefined)).toBeUndefined();
      expect(sanitizeUriForLog('')).toBeUndefined();
      expect(sanitizeUriForLog('   ')).toBeUndefined();
    });

    test('preserves content URIs as they do not contain sensitive paths', () => {
      expect(sanitizeUriForLog('content://media/external/images/media/123')).toBe(
        'content://media/external/images/media/123'
      );
    });

    test('masks file paths while preserving the filename', () => {
      expect(sanitizeUriForLog('file:///data/user/0/com.app/files/meal-123.jpg')).toBe(
        'file://.../meal-123.jpg'
      );
      expect(sanitizeUriForLog('/private/var/mobile/Containers/photo.jpg')).toBe(
        'file://.../photo.jpg'
      );
    });
  });

  describe('sanitizeError', () => {
    test('extracts message from Error instance', () => {
      const err = new Error('Sensitive path /data/app/crash');
      expect(sanitizeError(err)).toBe('Sensitive path /data/app/crash');
    });

    test('handles non-Error objects', () => {
      expect(sanitizeError('Just a string error')).toBe('Just a string error');
      expect(sanitizeError({ code: 500 })).toBe('[object Object]');
      expect(sanitizeError(null)).toBe('null');
    });
  });

  describe('sanitizeLogContext', () => {
    test('sanitizes uris and errors in a flat object', () => {
      const context = {
        captureAttemptId: 123,
        photoUri: 'file:///secret/path/image.jpg',
        sourcePhotoUri: '/another/secret/img.png',
        error: new Error('Failed to load'),
        status: 'failed'
      };

      const sanitized = sanitizeLogContext(context);
      expect(sanitized).toEqual({
        captureAttemptId: 123,
        photoUri: 'file://.../image.jpg',
        sourcePhotoUri: 'file://.../img.png',
        error: 'Failed to load',
        status: 'failed'
      });
    });

    test('sanitizes nested objects', () => {
      const context = {
        nested: {
          photoUri: '/secret/file.jpg',
          nestedError: new Error('Deep error')
        },
        arr: [1, 2, 3]
      };

      const sanitized = sanitizeLogContext(context);
      expect(sanitized).toEqual({
        nested: {
          photoUri: 'file://.../file.jpg',
          nestedError: 'Deep error'
        },
        arr: [1, 2, 3]
      });
    });

    test('handles nulls and primitive arrays', () => {
      const context = {
        val: null,
        arr: [1, null, 'str']
      };

      const sanitized = sanitizeLogContext(context);
      expect(sanitized).toEqual({
        val: null,
        arr: [1, null, 'str']
      });
    });
  });
});
