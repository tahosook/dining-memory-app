import { deleteAsync } from 'expo-file-system/legacy';

export async function cleanupTempFile(photoUri: string) {
  try {
    await deleteAsync(photoUri);
  } catch {
    console.warn('Temporary photo cleanup failed.');
  }
}
