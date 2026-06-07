import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { copyAsync, getInfoAsync } from 'expo-file-system/legacy';
import { writePhotoExifToJpeg } from '../src/media/photoExif';
import { ANDROID_PHOTO_ALBUM_NAME, persistPhotoToStablePath } from '../src/media/photoStorage';

jest.mock('expo-media-library', () => ({
  Asset: {
    create: jest.fn(),
  },
  Album: {
    get: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../src/media/photoExif', () => {
  const actual = jest.requireActual('../src/media/photoExif');

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
    (copyAsync as jest.Mock).mockResolvedValue(undefined);
    // Default: all files exist after copy (for file verification check)
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (writePhotoExifToJpeg as jest.Mock).mockResolvedValue(undefined);
  });

  test('stores Android photos in the dedicated Dining Memory album', async () => {
    Platform.OS = 'android';
    (getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // collision check
      .mockResolvedValueOnce({ exists: true }); // file verification
    const mockAsset = { id: 'asset-1', uri: 'file:///asset.jpg' };
    const mockAlbum = { id: 'album-1', add: jest.fn().mockResolvedValue(undefined) };
    (MediaLibrary.Asset.create as jest.Mock).mockResolvedValue(mockAsset);
    (MediaLibrary.Album.get as jest.Mock).mockResolvedValue(mockAlbum);

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
    expect(MediaLibrary.Asset.create).toHaveBeenCalledWith('file:///mock-documents/meal-20260422213507.jpg');
    expect(MediaLibrary.Album.get).toHaveBeenCalledWith(ANDROID_PHOTO_ALBUM_NAME);
    expect(mockAlbum.add).toHaveBeenCalledWith([mockAsset]);
    expect((writePhotoExifToJpeg as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (MediaLibrary.Asset.create as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
    expect(result.savedToMediaLibrary).toBe(true);
  });

  test('creates the dedicated album directly from the local file when it does not exist on Android', async () => {
    Platform.OS = 'android';
    (getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // collision check
      .mockResolvedValueOnce({ exists: true }); // file verification
    const mockAsset = { id: 'asset-1', uri: 'file:///asset.jpg' };
    const mockNewAlbum = { id: 'album-1' };
    (MediaLibrary.Asset.create as jest.Mock).mockResolvedValue(mockAsset);
    (MediaLibrary.Album.get as jest.Mock).mockResolvedValue(null); // Album doesn't exist
    (MediaLibrary.Album.create as jest.Mock).mockResolvedValue(mockNewAlbum);

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
    });

    expect(MediaLibrary.Asset.create).toHaveBeenCalledWith('file:///mock-documents/meal-20260422213507.jpg');
    expect(MediaLibrary.Album.get).toHaveBeenCalledWith(ANDROID_PHOTO_ALBUM_NAME);
    expect(MediaLibrary.Album.create).toHaveBeenCalledWith(ANDROID_PHOTO_ALBUM_NAME, [mockAsset]);
    expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
    expect(result.savedToMediaLibrary).toBe(true);
  });

  test('keeps the local stable copy even if album registration fails on Android', async () => {
    Platform.OS = 'android';
    (getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // collision check
      .mockResolvedValueOnce({ exists: true }); // file verification
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    (MediaLibrary.Asset.create as jest.Mock).mockRejectedValue(new Error('album failed'));

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
    });

    expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
    expect(result.savedToMediaLibrary).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Android album save failed, but local photo copy is preserved:',
      expect.any(Error)
    );
    consoleWarnSpy.mockRestore();
  });

  test('stores iOS photos in the document directory', async () => {
    Platform.OS = 'ios';
    (getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // collision check
      .mockResolvedValueOnce({ exists: true }); // file verification

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
      .mockResolvedValueOnce({ exists: true })  // collision check for meal-20260422213507.jpg
      .mockResolvedValueOnce({ exists: false }) // collision check for meal-20260422213507-1.jpg
      .mockResolvedValueOnce({ exists: true }); // verify file exists after copy

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
    (getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // collision check
      .mockResolvedValueOnce({ exists: true }); // file verification
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
