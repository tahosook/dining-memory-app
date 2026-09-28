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

  describe('Error object sanitization', () => {
    it('sanitizes macOS /Users/... absolute paths in Error.message', () => {
      const rawPath = '/Users/developer/work/app/src/secret-config.json';
      const error = new Error(`Failed to read ${rawPath}: ENOENT`);
      const sanitized = sanitizeLogObject(error);

      expect(sanitized).toBeInstanceOf(Error);
      expect(sanitized.message).not.toContain('/Users/developer/work/app/src/');
      expect(sanitized.message).not.toContain(rawPath);
      expect(sanitized.message).toBe(
        'Failed to read [MASKED_PATH]/secret-config.json: ENOENT'
      );
    });

    it('sanitizes Android /data/user/... absolute paths in Error.message', () => {
      const rawPath = '/data/user/0/com.example.app/files/meal-101.jpg';
      const error = new Error(`Failed to read ${rawPath}: ENOENT`);
      const sanitized = sanitizeLogObject(error);

      expect(sanitized).toBeInstanceOf(Error);
      expect(sanitized.message).not.toContain('/data/user/0/com.example.app/files/');
      expect(sanitized.message).not.toContain(rawPath);
      expect(sanitized.message).toBe(
        'Failed to read [MASKED_PATH]/meal-101.jpg: ENOENT'
      );
    });

    it('sanitizes file:///... URIs in Error.message', () => {
      const rawUri = 'file:///data/user/0/com.example.app/files/meal-202.jpg';
      const error = new Error(`Failed to open ${rawUri}`);
      const sanitized = sanitizeLogObject(error);

      expect(sanitized).toBeInstanceOf(Error);
      expect(sanitized.message).not.toContain('/data/user/0/com.example.app/files/');
      expect(sanitized.message).not.toContain(rawUri);
      expect(sanitized.message).toBe('Failed to open file://.../meal-202.jpg');
    });

    it('sanitizes absolute paths in Error.stack', () => {
      const rawPath = '/Users/developer/project/src/screens/SettingsScreen.tsx';
      const error = new Error('Something failed');
      error.stack = [
        'Error: Something failed',
        `    at SettingsScreen.loadData (${rawPath}:42:15)`,
        '    at asyncGeneratorStep (/Users/developer/project/node_modules/helpers/async.js:3:17)',
      ].join('\n');

      const sanitized = sanitizeLogObject(error);

      expect(sanitized.stack).toBeDefined();
      expect(sanitized.stack).not.toContain('/Users/developer/project/src/screens/');
      expect(sanitized.stack).not.toContain(rawPath);
      expect(sanitized.stack).not.toContain('/Users/developer/project/node_modules/helpers/');
      expect(sanitized.stack).toContain('[MASKED_PATH]/SettingsScreen.tsx:42:15');
      expect(sanitized.stack).toContain('[MASKED_PATH]/async.js:3:17');
    });

    it('sanitizes file:// URIs in Error.stack', () => {
      const rawBundleUri = 'file:///data/user/0/com.example.app/index.android.bundle';
      const error = new Error('Fatal JS Exception');
      error.stack = [
        'Error: Fatal JS Exception',
        `    at renderScreen (${rawBundleUri}:100:20)`,
      ].join('\n');

      const sanitized = sanitizeLogObject(error);

      expect(sanitized.stack).toBeDefined();
      expect(sanitized.stack).not.toContain('/data/user/0/com.example.app/');
      expect(sanitized.stack).not.toContain(rawBundleUri);
      expect(sanitized.stack).toContain('file://.../index.android.bundle:100:20');
    });

    it('sanitizes nested object containing path, URI, and URL properties', () => {
      const rawCapturedPath = '/data/user/0/com.example.app/cache/photo-123.jpg';
      const rawSourceUri = 'file:///var/mobile/Containers/Data/photo-456.jpg';
      const rawRemoteUrl = 'https://example.com/images/sample.jpg';
      const rawErrorPath = '/private/var/log/error.log';

      const complexObject = {
        status: 'error',
        context: {
          capturedPhotoPath: rawCapturedPath,
          sourceUri: rawSourceUri,
          remoteUrl: rawRemoteUrl,
          error: new Error(`Sub-task failed at ${rawErrorPath}`),
        },
      };

      const sanitized = sanitizeLogObject(complexObject);

      expect(sanitized.context.capturedPhotoPath).not.toContain('/data/user/0/com.example.app/cache/');
      expect(sanitized.context.capturedPhotoPath).toBe('[MASKED_PATH]/photo-123.jpg');

      expect(sanitized.context.sourceUri).not.toContain('/var/mobile/Containers/Data/');
      expect(sanitized.context.sourceUri).toBe('file://.../photo-456.jpg');

      expect(sanitized.context.remoteUrl).not.toContain('https://example.com/images/');
      expect(sanitized.context.remoteUrl).toBe('[MASKED_PATH]/sample.jpg');

      expect(sanitized.context.error.message).not.toContain('/private/var/log/');
      expect(sanitized.context.error.message).toBe(
        'Sub-task failed at [MASKED_PATH]/error.log'
      );
    });

    it('sanitizes objects and errors inside arrays', () => {
      const rawPath1 = '/Users/developer/file1.txt';
      const rawUri2 = 'file:///data/user/0/com.example/photo2.jpg';
      const rawErrorPath3 = '/Users/developer/file3.txt';

      const arrayInput = [
        { path: rawPath1, label: 'Item 1' },
        { uri: rawUri2, label: 'Item 2' },
        { error: new Error(`Failed to load ${rawErrorPath3}`) },
      ];

      const sanitizedArray = sanitizeLogObject(arrayInput);

      expect(sanitizedArray[0]?.path).not.toContain('/Users/developer/');
      expect(sanitizedArray[0]?.path).toBe('[MASKED_PATH]/file1.txt');

      expect(sanitizedArray[1]?.uri).not.toContain('/data/user/0/com.example/');
      expect(sanitizedArray[1]?.uri).toBe('file://.../photo2.jpg');

      expect(sanitizedArray[2]?.error?.message).not.toContain('/Users/developer/');
      expect(sanitizedArray[2]?.error?.message).toBe(
        'Failed to load [MASKED_PATH]/file3.txt'
      );
    });

    it('preserves required information in standard Error messages without paths', () => {
      const error = new Error('Network request failed with status code 503');
      const sanitized = sanitizeLogObject(error);

      expect(sanitized).toBeInstanceOf(Error);
      expect(sanitized.message).toBe('Network request failed with status code 503');
      expect(sanitized.name).toBe('Error');
    });
  });
});
