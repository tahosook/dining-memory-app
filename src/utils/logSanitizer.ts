export function sanitizeUriForLog(uri?: string): string | undefined {
  if (!uri || uri.trim() === '') {
    return undefined;
  }

  const trimmed = uri.trim();
  if (trimmed.startsWith('content://')) {
    // Content URIs like content://media/external/images/media/1234 don't contain personal paths
    return trimmed;
  }

  // For file:// or absolute paths, mask the user/app container structure and keep only filename
  const slashIndex = trimmed.lastIndexOf('/');
  if (slashIndex >= 0 && slashIndex < trimmed.length - 1) {
    const filename = trimmed.slice(slashIndex + 1);
    return `file://.../${filename}`;
  }

  return 'file://...';
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function sanitizeLogContext(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (key.toLowerCase().includes('uri') && typeof value === 'string') {
      sanitized[key] = sanitizeUriForLog(value);
    } else if (key.toLowerCase().includes('error')) {
      sanitized[key] = sanitizeError(value);
    } else if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        sanitized[key] = value;
      } else {
        sanitized[key] = sanitizeLogContext(value as Record<string, unknown>);
      }
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
