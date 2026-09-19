import ImageResizer from '@bam.tech/react-native-image-resizer';
import { CAMERA_CONSTANTS } from '../src/constants/CameraConstants';
import {
  persistPhotoToStablePath,
  persistThumbnailToStablePath,
} from '../src/media/photoStorage';
import { cleanupTempFile } from '../src/media/tempFiles';
import { persistCapturePhotoLocally } from '../src/hooks/cameraCapture/capturePhotoPersistence';

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(),
  },
}));

jest.mock('../src/media/photoStorage', () => ({
  persistPhotoToStablePath: jest.fn(),
  persistThumbnailToStablePath: jest.fn(),
}));

jest.mock('../src/media/tempFiles', () => ({
  cleanupTempFile: jest.fn(),
}));

describe('capturePhotoPersistence', () => {
  const capturedAt = new Date(2026, 3, 22, 21, 35, 7);
  const options = {
    capturedAt,
    location: { latitude: 35.6895, longitude: 139.6917 },
    softwareName: 'Dining Memory',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock behavior:
    // First call is original (1600x1200, 75%)
    // Second call is thumbnail (320x320, 70%)
    (ImageResizer.createResizedImage as jest.Mock)
      .mockResolvedValueOnce({
        uri: 'file:///tmp/resized-original.jpg',
        path: '/tmp/resized-original.jpg',
        width: 1600,
        height: 1200,
        size: 120000,
      })
      .mockResolvedValueOnce({
        uri: 'file:///tmp/resized-thumbnail.jpg',
        path: '/tmp/resized-thumbnail.jpg',
        width: 320,
        height: 240,
        size: 18000,
      });

    (persistPhotoToStablePath as jest.Mock).mockResolvedValue({
      stablePhotoUri: 'file:///documents/meal-20260422213507.jpg',
      savedToMediaLibrary: true,
    });

    (persistThumbnailToStablePath as jest.Mock).mockResolvedValue(
      'file:///documents/meal-20260422213507-thumb.jpg'
    );

    (cleanupTempFile as jest.Mock).mockResolvedValue(undefined);
  });

  test('generates and persists both original and thumbnail to stable paths', async () => {
    const result = await persistCapturePhotoLocally('file:///tmp/captured-raw.jpg', options);

    // 1. Original resize
    expect(ImageResizer.createResizedImage).toHaveBeenNthCalledWith(
      1,
      'file:///tmp/captured-raw.jpg',
      CAMERA_CONSTANTS.SAVED_PHOTO_MAX_WIDTH,
      CAMERA_CONSTANTS.SAVED_PHOTO_MAX_HEIGHT,
      'JPEG',
      CAMERA_CONSTANTS.SAVED_PHOTO_QUALITY_PERCENT,
      0,
      undefined,
      true,
      {
        mode: 'contain',
        onlyScaleDown: true,
      }
    );

    // 2. Original persist
    expect(persistPhotoToStablePath).toHaveBeenCalledWith(
      'file:///tmp/resized-original.jpg',
      options
    );

    // 3. Original temp cleanup
    expect(cleanupTempFile).toHaveBeenCalledWith('file:///tmp/resized-original.jpg');

    // 4. Thumbnail resize
    expect(ImageResizer.createResizedImage).toHaveBeenNthCalledWith(
      2,
      'file:///tmp/captured-raw.jpg',
      CAMERA_CONSTANTS.THUMBNAIL_PHOTO_MAX_WIDTH,
      CAMERA_CONSTANTS.THUMBNAIL_PHOTO_MAX_HEIGHT,
      'JPEG',
      CAMERA_CONSTANTS.THUMBNAIL_PHOTO_QUALITY_PERCENT,
      0,
      undefined,
      true,
      {
        mode: 'contain',
        onlyScaleDown: true,
      }
    );

    // 5. Thumbnail persist to stable path
    expect(persistThumbnailToStablePath).toHaveBeenCalledWith(
      'file:///tmp/resized-thumbnail.jpg',
      'file:///documents/meal-20260422213507.jpg'
    );

    // 6. Thumbnail temp cleanup
    expect(cleanupTempFile).toHaveBeenCalledWith('file:///tmp/resized-thumbnail.jpg');

    // 7. Result verification
    expect(result).toEqual({
      stablePhotoUri: 'file:///documents/meal-20260422213507.jpg',
      stableThumbnailUri: 'file:///documents/meal-20260422213507-thumb.jpg',
      resizedPhotoUri: 'file:///tmp/resized-original.jpg',
      savedToMediaLibrary: true,
    });
  });

  test('does not cleanup photoUri if resizedPhotoUri is identical to photoUri', async () => {
    (ImageResizer.createResizedImage as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({
        uri: 'file:///tmp/captured-raw.jpg',
      })
      .mockResolvedValueOnce({
        uri: 'file:///tmp/captured-raw.jpg',
      });

    await persistCapturePhotoLocally('file:///tmp/captured-raw.jpg', options);

    expect(cleanupTempFile).not.toHaveBeenCalledWith('file:///tmp/captured-raw.jpg');
  });

  test('preserves original photo even if thumbnail generation fails', async () => {
    (ImageResizer.createResizedImage as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({
        uri: 'file:///tmp/resized-original.jpg',
        width: 1600,
        height: 1200,
      })
      .mockRejectedValueOnce(new Error('Out of memory during thumbnail creation'));

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());

    const result = await persistCapturePhotoLocally('file:///tmp/captured-raw.jpg', options);

    expect(result.stablePhotoUri).toBe('file:///documents/meal-20260422213507.jpg');
    expect(result.stableThumbnailUri).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Thumbnail generation failed, but original photo is preserved:',
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });

  test('preserves original photo even if thumbnail persistence copy fails', async () => {
    (persistThumbnailToStablePath as jest.Mock).mockRejectedValueOnce(
      new Error('Disk write failed')
    );

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());

    const result = await persistCapturePhotoLocally('file:///tmp/captured-raw.jpg', options);

    expect(result.stablePhotoUri).toBe('file:///documents/meal-20260422213507.jpg');
    expect(result.stableThumbnailUri).toBeUndefined();
    expect(cleanupTempFile).toHaveBeenCalledWith('file:///tmp/resized-thumbnail.jpg');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Thumbnail generation failed, but original photo is preserved:',
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });
});
