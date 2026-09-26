import { persistPhotoToStablePath } from '../src/media/photoStorage';
import { persistCapturePhotoLocally } from '../src/hooks/cameraCapture/capturePhotoPersistence';

jest.mock('../src/media/photoStorage', () => ({
  persistPhotoToStablePath: jest.fn(),
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

    (persistPhotoToStablePath as jest.Mock).mockResolvedValue({
      stablePhotoUri: 'file:///documents/meal-20260422213507.jpg',
      savedToMediaLibrary: true,
    });
  });

  test('delegates persistence to persistPhotoToStablePath without double resizing', async () => {
    const result = await persistCapturePhotoLocally('file:///tmp/captured-raw.jpg', options);

    // Persist is called directly with the input photoUri (resizing is handled inside persistPhotoToStablePath)
    expect(persistPhotoToStablePath).toHaveBeenCalledTimes(1);
    expect(persistPhotoToStablePath).toHaveBeenCalledWith(
      'file:///tmp/captured-raw.jpg',
      options
    );

    // Result contains stablePhotoUri and undefined stableThumbnailUri (async thumbnail handled separately)
    expect(result).toEqual({
      stablePhotoUri: 'file:///documents/meal-20260422213507.jpg',
      stableThumbnailUri: undefined,
      resizedPhotoUri: 'file:///documents/meal-20260422213507.jpg',
      savedToMediaLibrary: true,
    });
  });
});
