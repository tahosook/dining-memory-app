export function sanitizeUriForLog(uri?: string): string | undefined {
  if (!uri || typeof uri !== 'string' || uri.trim() === '') {
    return undefined;
  }

  const trimmed = uri.trim();
  if (trimmed.startsWith('content://')) {
    // Content URIs like content://media/external/images/media/1234 don't contain personal paths
    return trimmed;
  }

  // For file:// or absolute paths, mask the user/app container structure and keep only filename
  const slashIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (slashIndex >= 0 && slashIndex < trimmed.length - 1) {
    const filename = trimmed.slice(slashIndex + 1);
    if (trimmed.startsWith('file://')) {
      return `file://.../${filename}`;
    }
    return `[MASKED_PATH]/${filename}`;
  }

  return 'file://...';
}

/**
 * Sanitizes embedded URIs and absolute paths within a text string (e.g. Error message or stack trace).
 */
export function sanitizeTextForLog(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // 1. Mask file:// URIs (e.g. file:///data/user/0/app/files/photo.jpg -> file://.../photo.jpg)
  let result = text.replace(/file:\/\/[^\s'"<>,;()[\]{}]+/g, match => {
    return sanitizeUriForLog(match) ?? match;
  });

  // 2. Mask Windows absolute paths (e.g. C:\Users\app\file.txt -> [MASKED_PATH]/file.txt)
  result = result.replace(
    /(^|[[\]\s'"<>,;(`{}=])([A-Za-z]:\\[^\s'"<>,;()[\]{}]+)/g,
    (_match, prefix, pathStr) => {
      return prefix + (sanitizeUriForLog(pathStr) ?? pathStr);
    }
  );

  // 3. Mask Unix absolute paths with at least 2 segments (e.g. /data/user/0/com.app/photos/meal.jpg -> [MASKED_PATH]/meal.jpg)
  // or stack traces like (/Users/dev/app/src/index.ts:10:5)
  result = result.replace(
    /(^|[[\]\s'"<>,;(`{}=])(\/(?:[A-Za-z0-9_.\-~@]+\/)+[A-Za-z0-9_.\-~@]+(?::\d+(?::\d+)?)?)/g,
    (_match, prefix, pathStr) => {
      const slashIdx = Math.max(pathStr.lastIndexOf('/'), pathStr.lastIndexOf('\\'));
      const filename =
        slashIdx >= 0 && slashIdx < pathStr.length - 1 ? pathStr.slice(slashIdx + 1) : '';
      const masked = filename ? `[MASKED_PATH]/${filename}` : '[MASKED_PATH]';
      return prefix + masked;
    }
  );

  return result;
}

/**
 * Checks if a given key is likely to contain a URI or file path based on its name.
 */
function isUriKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return lowerKey.includes('uri') || lowerKey.includes('path') || lowerKey.includes('url');
}

/**
 * Recursively sanitizes any URI/path strings within an object.
 */
export function sanitizeLogObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // We only sanitize strings if they look like file paths in a root level call,
    // but typically this is called with objects. We'll leave raw strings alone
    // unless they start with file:// to be safe.
    if (obj.startsWith('file://') || obj.startsWith('/')) {
      return sanitizeUriForLog(obj) as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeLogObject(item)) as unknown as T;
  }

  if (obj instanceof Error) {
    const sanitizedError = new Error(sanitizeTextForLog(obj.message));
    sanitizedError.name = obj.name;
    if (obj.stack) {
      sanitizedError.stack = sanitizeTextForLog(obj.stack);
    }
    const target = sanitizedError as unknown as Record<string, unknown>;
    // Copy any custom properties the error might have
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'name' || key === 'message' || key === 'stack') {
        continue;
      }
      if (typeof value === 'string') {
        target[key] = isUriKey(key) ? sanitizeUriForLog(value) : sanitizeTextForLog(value);
      } else if (typeof value === 'object' && value !== null) {
        target[key] = sanitizeLogObject(value);
      } else {
        target[key] = value;
      }
    }
    return sanitizedError as unknown as T;
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && isUriKey(key)) {
        sanitized[key] = sanitizeUriForLog(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeLogObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized as unknown as T;
  }

  return obj;
}
