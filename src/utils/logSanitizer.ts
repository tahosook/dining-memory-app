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
    const sanitizedError = new Error(obj.message) as any;
    sanitizedError.name = obj.name;
    // Keep stack trace only in dev, or at least preserve it if not __DEV__ conditionally
    const isDev =
      typeof globalThis !== 'undefined' &&
      (globalThis as any).process &&
      (globalThis as any).process.env &&
      (globalThis as any).process.env.NODE_ENV !== 'production';
    if (isDev) {
      sanitizedError.stack = obj.stack;
    } else {
      sanitizedError.stack = undefined;
    }
    // Copy any custom properties the error might have
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && isUriKey(key)) {
        sanitizedError[key] = sanitizeUriForLog(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitizedError[key] = sanitizeLogObject(value);
      } else {
        sanitizedError[key] = value;
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
