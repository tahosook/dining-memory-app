const SAFE_PHOTO_FILENAME_REGEX = /^[a-zA-Z0-9_.-]+\.(jpe?g|png)$/i;

export function extractPhotoFileName(photoUri: string): string {
  if (!photoUri || typeof photoUri !== 'string') {
    return '';
  }

  // Strip query parameters or hash if any
  const cleanUri = photoUri.split('?')[0].split('#')[0];
  const lastSlashIndex = Math.max(cleanUri.lastIndexOf('/'), cleanUri.lastIndexOf('\\'));
  const fileName = lastSlashIndex >= 0 ? cleanUri.slice(lastSlashIndex + 1) : cleanUri;

  return fileName;
}

export function validateSafeFileName(fileName: string): boolean {
  if (!fileName || typeof fileName !== 'string') {
    return false;
  }

  // Disallow path traversal, directory separators, or non-matching extensions
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return false;
  }

  return SAFE_PHOTO_FILENAME_REGEX.test(fileName);
}

export function isOriginalPhotoFileName(fileName: string): boolean {
  if (!validateSafeFileName(fileName)) {
    return false;
  }

  // Explicitly reject thumbnails
  return !fileName.toLowerCase().includes('-thumb.');
}

export function resolveRestoredPhotoUri(
  photoFileName: string,
  documentsDirectoryUri: string
): string {
  if (!validateSafeFileName(photoFileName)) {
    throw new Error(`Invalid or unsafe photo file name: ${photoFileName}`);
  }

  const base = documentsDirectoryUri.endsWith('/')
    ? documentsDirectoryUri
    : `${documentsDirectoryUri}/`;

  return `${base}${photoFileName}`;
}
