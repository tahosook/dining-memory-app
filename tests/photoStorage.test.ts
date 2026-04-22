import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { copyAsync, getInfoAsync } from 'expo-file-system/legacy';
import { writePhotoExifToJpeg } from '../src/hooks/cameraCapture/photoExif';
import { ANDROID_PHOTO_ALBUM_NAME, persistPhotoToStablePath } from '../src/hooks/cameraCapture/photoStorage';

jest.mock('expo-media-library', () => ({
  createAssetAsync: jest.fn(),
  getAlbumAsync: jest.fn(),
  createAlbumAsync: jest.fn(),
}));

jest.mock('../src/hooks/cameraCapture/photoExif', () => {
  const actual = jest.requireActual('../src/hooks/cameraCapture/photoExif');

  return {
    ...actual,
    writePhotoExifToJpeg: jest.fn(),
  };
});

jest.mock('expo-file-system/legacy', () => ({
  copyAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  documentDirectory: 'file:///mock-documents/',
}));

describe('photoStorage', () => {
  const capturedAt = new Date(2026, 3, 22, 21, 35, 7);

  beforeEach(() => {
    jest.clearAllMocks();
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    (writePhotoExifToJpeg as jest.Mock).mockResolvedValue(undefined);
  });

  test('stores Android photos in the dedicated Dining Memory album', async () => {
    Platform.OS = 'android';
    (MediaLibrary.createAssetAsync as jest.Mock).mockResolvedValue({ id: 'asset-1', uri: 'file:///asset.jpg' });
    (MediaLibrary.getAlbumAsync as jest.Mock).mockResolvedValue({ id: 'album-1' });

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
      location: { latitude: 35.6895, longitude: 139.6917 },
    });

    expect(copyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/resized-photo.jpg',
      to: 'file:///mock-documents/meal-20260422213507.jpg',
    });
    expect(writePhotoExifToJpeg).toHaveBeenCalledWith(
      'file:///mock-documents/meal-20260422213507.jpg',
      {
        capturedAt,
        location: { latitude: 35.6895, longitude: 139.6917 },
        softwareName: 'Dining Memory',
      }
    );
    expect(MediaLibrary.getAlbumAsync).toHaveBeenCalledWith(ANDROID_PHOTO_ALBUM_NAME);
    expect(MediaLibrary.createAssetAsync).toHaveBeenCalledWith(
      'file:///mock-documents/meal-20260422213507.jpg',
      { id: 'album-1' },
    );
    expect((writePhotoExifToJpeg as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (MediaLibrary.createAssetAsync as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
    expect(result.savedToMediaLibrary).toBe(true);
  });

  test('creates the dedicated album directly from the local file when it does not exist on Android', async () => {
    Platform.OS = 'android';
    (MediaLibrary.getAlbumAsync as jest.Mock).mockResolvedValue(null);

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
    });

    expect(MediaLibrary.createAlbumAsync).toHaveBeenCalledWith(
      ANDROID_PHOTO_ALBUM_NAME,
      undefined,
      undefined,
      'file:///mock-documents/meal-20260422213507.jpg'
    );
    expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
    expect(result.savedToMediaLibrary).toBe(true);
  });

  test('keeps the local stable copy even if album registration fails on Android', async () => {
    Platform.OS = 'android';
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    (MediaLibrary.getAlbumAsync as jest.Mock).mockResolvedValue({ id: 'album-1' });
    (MediaLibrary.createAssetAsync as jest.Mock).mockRejectedValue(new Error('album failed'));

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
    });

    expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
    expect(result.savedToMediaLibrary).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Android album save failed, but local photo copy is preserved:',
      expect.any(Error)
    );
    consoleWarnSpy.mockRestore();
  });

  test('stores iOS photos in the document directory', async () => {
    Platform.OS = 'ios';

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
    });

    expect(copyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/resized-photo.jpg',
      to: 'file:///mock-documents/meal-20260422213507.jpg',
    });
    expect(result.savedToMediaLibrary).toBe(false);
  });

  test('adds a numeric suffix when the timestamp-based name already exists', async () => {
    Platform.OS = 'ios';
    (getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ exists: false });

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
    });

    expect(copyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/resized-photo.jpg',
      to: 'file:///mock-documents/meal-20260422213507-1.jpg',
    });
    expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507-1.jpg');
  });

  test('continues saving when EXIF writing fails', async () => {
    Platform.OS = 'ios';
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    (writePhotoExifToJpeg as jest.Mock).mockRejectedValue(new Error('exif failed'));

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
    });

    expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Photo EXIF update skipped, but local photo copy is preserved:',
      expect.any(Error)
    );
    consoleWarnSpy.mockRestore();
  });
});
