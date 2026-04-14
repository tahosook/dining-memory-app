import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { copyAsync } from 'expo-file-system/legacy';
import { ANDROID_PHOTO_ALBUM_NAME, persistPhotoToStablePath } from '../src/hooks/cameraCapture/photoStorage';

jest.mock('expo-media-library', () => ({
  createAssetAsync: jest.fn(),
  getAlbumAsync: jest.fn(),
  createAlbumAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  copyAsync: jest.fn(),
  documentDirectory: 'file:///mock-documents/',
}));

describe('photoStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('stores Android photos in the dedicated Dining Memory album', async () => {
    Platform.OS = 'android';
    (MediaLibrary.createAssetAsync as jest.Mock).mockResolvedValue({ id: 'asset-1', uri: 'file:///asset.jpg' });
    (MediaLibrary.getAlbumAsync as jest.Mock).mockResolvedValue({ id: 'album-1' });

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg');

    expect(copyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/resized-photo.jpg',
      to: expect.stringMatching(/^file:\/\/\/mock-documents\/meal-\d+\.jpg$/),
    });
    expect(MediaLibrary.getAlbumAsync).toHaveBeenCalledWith(ANDROID_PHOTO_ALBUM_NAME);
    expect(MediaLibrary.createAssetAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/mock-documents\/meal-\d+\.jpg$/),
      { id: 'album-1' },
    );
    expect(result.stablePhotoUri).toMatch(/^file:\/\/\/mock-documents\/meal-\d+\.jpg$/);
    expect(result.savedToMediaLibrary).toBe(true);
  });

  test('creates the dedicated album directly from the local file when it does not exist on Android', async () => {
    Platform.OS = 'android';
    (MediaLibrary.getAlbumAsync as jest.Mock).mockResolvedValue(null);

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg');

    expect(MediaLibrary.createAlbumAsync).toHaveBeenCalledWith(
      ANDROID_PHOTO_ALBUM_NAME,
      undefined,
      undefined,
      expect.stringMatching(/^file:\/\/\/mock-documents\/meal-\d+\.jpg$/)
    );
    expect(result.stablePhotoUri).toMatch(/^file:\/\/\/mock-documents\/meal-\d+\.jpg$/);
    expect(result.savedToMediaLibrary).toBe(true);
  });

  test('keeps the local stable copy even if album registration fails on Android', async () => {
    Platform.OS = 'android';
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    (MediaLibrary.getAlbumAsync as jest.Mock).mockResolvedValue({ id: 'album-1' });
    (MediaLibrary.createAssetAsync as jest.Mock).mockRejectedValue(new Error('album failed'));

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg');

    expect(result.stablePhotoUri).toMatch(/^file:\/\/\/mock-documents\/meal-\d+\.jpg$/);
    expect(result.savedToMediaLibrary).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Android album save failed, but local photo copy is preserved:',
      expect.any(Error)
    );
    consoleWarnSpy.mockRestore();
  });

  test('stores iOS photos in the document directory', async () => {
    Platform.OS = 'ios';

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg');

    expect(copyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/resized-photo.jpg',
      to: expect.stringMatching(/^file:\/\/\/mock-documents\/meal-\d+\.jpg$/),
    });
    expect(result.savedToMediaLibrary).toBe(false);
  });
});
