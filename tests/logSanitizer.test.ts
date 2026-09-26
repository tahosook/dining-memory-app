import { sanitizePath, sanitizeLogObject } from '../src/utils/logSanitizer';

describe('logSanitizer', () => {
  describe('sanitizePath', () => {
    it('should mask file:// paths', () => {
      const input = 'file:///data/user/0/com.app/files/photo-123.jpg';
      const output = sanitizePath(input);
      expect(output).toBe('[REDACTED_DIR]/photo-123.jpg');
    });

    it('should mask /data/user/ paths without file://', () => {
      const input = '/data/user/0/com.app/cache/temp-456.png';
      const output = sanitizePath(input);
      expect(output).toBe('[REDACTED_DIR]/temp-456.png');
    });

    it('should leave safe strings intact', () => {
      const input = 'This is a normal log message.';
      const output = sanitizePath(input);
      expect(output).toBe('This is a normal log message.');
    });

    it('should handle strings with paths embedded in them', () => {
      const input = 'Loaded photo from file:///data/user/0/abc.jpg successfully.';
      const output = sanitizePath(input);
      expect(output).toBe('Loaded photo from [REDACTED_DIR]/abc.jpg successfully.');
    });
  });

  describe('sanitizeLogObject', () => {
    it('should sanitize paths within objects recursively', () => {
      const input = {
        userId: 'user123',
        photo: {
          uri: 'file:///data/user/0/app/cache/image.jpg',
          size: 1024,
        },
        tags: ['food', '/data/user/0/app/test.png'],
      };

      const output = sanitizeLogObject(input);
      expect(output).toEqual({
        userId: 'user123',
        photo: {
          uri: '[REDACTED_DIR]/image.jpg',
          size: 1024,
        },
        tags: ['food', '[REDACTED_DIR]/test.png'],
      });
    });

    it('should safely serialize Error objects', () => {
      const error = new Error('Failed to read file:///data/user/0/secret.txt');
      error.stack = 'Error: Failed to read file:///data/user/0/secret.txt\n    at func (/data/user/0/code.js:1:1)';

      const output = sanitizeLogObject(error);
      expect(output.name).toBe('Error');
      expect(output.message).toBe('Failed to read [REDACTED_DIR]/secret.txt');
      expect(output.stack).toContain('[REDACTED_DIR]/secret.txt');
      expect(output.stack).toContain('[REDACTED_DIR]/code.js:1:1)');
    });

    it('should handle null or undefined safely', () => {
      expect(sanitizeLogObject(null)).toBeNull();
      expect(sanitizeLogObject(undefined)).toBeUndefined();
    });
  });
});
