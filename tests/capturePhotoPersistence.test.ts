import ImageResizer from '@bam.tech/react-native-image-resizer';
import { CAMERA_CONSTANTS } from '../src/constants/CameraConstants';
import { persistPhotoToStablePath } from '../src/media/photoStorage';
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

    (ImageResizer.createResizedImage as jest.Mock).mockResolvedValue({
      uri: 'file:///tmp/resized-original.jpg',
      path: '/tmp/resized-original.jpg',
      width: 1600,
      height: 1200,
      size: 120000,
    });

    (persistPhotoToStablePath as jest.Mock).mockResolvedValue({
      stablePhotoUri: 'file:///documents/meal-20260422213507.jpg',
      savedToMediaLibrary: true,
    });

    (cleanupTempFile as jest.Mock).mockResolvedValue(undefined);
  });

  test('resizes and persists original photo locally without blocking on thumbnail generation', async () => {
    const result = await persistCapturePhotoLocally('file:///tmp/captured-raw.jpg', options);

    // 1. Original resize
    expect(ImageResizer.createResizedImage).toHaveBeenCalledTimes(1);
    expect(ImageResizer.createResizedImage).toHaveBeenCalledWith(
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

    // 3. Cleanup of resized temp original
    expect(cleanupTempFile).toHaveBeenCalledWith('file:///tmp/resized-original.jpg');

    // 4. Result contains stablePhotoUri and undefined stableThumbnailUri (async thumbnail handled separately)
    expect(result).toEqual({
      stablePhotoUri: 'file:///documents/meal-20260422213507.jpg',
      stableThumbnailUri: undefined,
      resizedPhotoUri: 'file:///tmp/resized-original.jpg',
      savedToMediaLibrary: true,
    });
  });

  test('does not cleanup photoUri if resizedPhotoUri is identical to photoUri', async () => {
    (ImageResizer.createResizedImage as jest.Mock).mockResolvedValueOnce({
      uri: 'file:///tmp/captured-raw.jpg',
    });

    await persistCapturePhotoLocally('file:///tmp/captured-raw.jpg', options);

    expect(cleanupTempFile).not.toHaveBeenCalledWith('file:///tmp/captured-raw.jpg');
  });
});
