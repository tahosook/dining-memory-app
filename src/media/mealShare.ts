import { NativeModules, Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { getInfoAsync } from 'expo-file-system/legacy';
import { sanitizeUriForLog } from '../utils/logSanitizer';

export interface MealShareOptions {
  title: string;
  text: string;
  photoUri?: string;
  mimeType?: string;
  dialogTitle?: string;
}

export type StorageLocationType =
  | 'cache'
  | 'document'
  | 'mediaStore'
  | 'external'
  | 'unknown'
  | 'none';

export interface MealShareDebugInfo {
  platform: string;
  photoUri?: string;
  mimeType: string;
  fileSize?: number;
  exists?: boolean;
  storageLocation: StorageLocationType;
  shareTextLength: number;
}

export interface MealShareResult {
  completed: boolean;
  platform: string;
  method: 'mealShareNative' | 'expoSharing' | 'reactNativeShare';
  details?: unknown;
}

export function detectStorageLocation(uri?: string): StorageLocationType {
  if (!uri || uri.trim() === '') {
    return 'none';
  }

  const normalized = uri.trim().toLowerCase();

  if (normalized.startsWith('content://media/')) {
    return 'mediaStore';
  }

  if (
    normalized.includes('/cache/') ||
    normalized.includes('cached_') ||
    normalized.includes('cache')
  ) {
    return 'cache';
  }

  if (
    normalized.includes('/files/') ||
    normalized.includes('document') ||
    normalized.includes('expo_files')
  ) {
    return 'document';
  }

  if (normalized.startsWith('file://') || normalized.startsWith('/')) {
    return 'external';
  }

  return 'unknown';
}

export async function inspectSharePhoto(
  photoUri?: string,
  mimeType = 'image/jpeg'
): Promise<MealShareDebugInfo> {
  const debugInfo: MealShareDebugInfo = {
    platform: Platform.OS,
    photoUri: sanitizeUriForLog(photoUri),
    mimeType,
    storageLocation: detectStorageLocation(photoUri),
    shareTextLength: 0,
  };

  if (!photoUri || photoUri.trim() === '') {
    return debugInfo;
  }

  try {
    const fileInfo = await getInfoAsync(photoUri);
    debugInfo.exists = fileInfo.exists;
    if (fileInfo.exists) {
      debugInfo.fileSize = fileInfo.size;
    }
  } catch (error) {
    console.warn('[MealShare] Failed to inspect photoUri file info:', error);
  }

  return debugInfo;
}

export async function shareMealContent(options: MealShareOptions): Promise<MealShareResult> {
  const mimeType = options.mimeType ?? 'image/jpeg';
  const debugInfo = await inspectSharePhoto(options.photoUri, mimeType);
  debugInfo.shareTextLength = options.text.length;

  console.info('[MealShare] Preparing meal share:', {
    platform: debugInfo.platform,
    photoUri: debugInfo.photoUri,
    mimeType: debugInfo.mimeType,
    fileSize: debugInfo.fileSize,
    storageLocation: debugInfo.storageLocation,
    exists: debugInfo.exists,
    shareTextLength: debugInfo.shareTextLength,
  });

  try {
    if (Platform.OS === 'ios' && options.photoUri) {
      const shareResult = await Share.share({
        title: options.title,
        message: options.text,
        url: options.photoUri,
      });

      console.info('[MealShare] iOS share completed:', shareResult);
      return {
        completed: true,
        platform: 'ios',
        method: 'reactNativeShare',
        details: shareResult,
      };
    }

    if (Platform.OS === 'android') {
      const dialogTitle = options.dialogTitle ?? '共有';
      const mealShareModule = NativeModules.MealShare;

      if (mealShareModule?.shareMeal) {
        try {
          const result = await mealShareModule.shareMeal({
            title: dialogTitle,
            text: options.text,
            photoUri: options.photoUri,
            mimeType,
          });

          console.info('[MealShare] Android native share completed:', result);
          return {
            completed: true,
            platform: 'android',
            method: 'mealShareNative',
            details: result,
          };
        } catch (nativeError) {
          console.warn(
            '[MealShare] Android native share threw, falling back to next available method:',
            nativeError
          );
        }
      }

      // Fallback if native module is not linked or failed
      if (options.photoUri && options.photoUri.trim() !== '') {
        try {
          const sharingAvailable = await Sharing.isAvailableAsync();

          if (sharingAvailable) {
            await Sharing.shareAsync(options.photoUri, {
              dialogTitle,
              mimeType,
            });

            console.info('[MealShare] Fallback Android expo-sharing completed');
            return {
              completed: true,
              platform: 'android',
              method: 'expoSharing',
            };
          }
        } catch (expoSharingError) {
          console.warn(
            '[MealShare] Fallback expo-sharing failed, attempting standard Share:',
            expoSharingError
          );
        }
      }

      const fallbackResult = await Share.share(
        {
          title: options.title,
          message: options.text,
        },
        {
          dialogTitle,
        }
      );

      console.info('[MealShare] Fallback Android standard share completed:', fallbackResult);
      return {
        completed: true,
        platform: 'android',
        method: 'reactNativeShare',
        details: fallbackResult,
      };
    }

    // Default / Web / Other platforms
    const defaultResult = await Share.share(
      {
        title: options.title,
        message: options.text,
      },
      {
        dialogTitle: options.title,
      }
    );

    console.info('[MealShare] Default share completed:', defaultResult);
    return {
      completed: true,
      platform: Platform.OS,
      method: 'reactNativeShare',
      details: defaultResult,
    };
  } catch (error) {
    console.error('[MealShare] Failed to share meal:', {
      error: error instanceof Error ? error.message : String(error),
      ...debugInfo,
    });
    throw error;
  }
}
