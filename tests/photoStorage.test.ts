import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { copyAsync, getInfoAsync } from 'expo-file-system/legacy';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { CAMERA_CONSTANTS } from '../src/constants/CameraConstants';
import { cleanupTempFile } from '../src/media/tempFiles';
import { writePhotoExifToJpeg } from '../src/media/photoExif';
import {
  ANDROID_PHOTO_ALBUM_NAME,
  persistPhotoToStablePath,
  persistThumbnailToStablePath,
  resolveThumbnailDestinationUri,
} from '../src/media/photoStorage';

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(),
  },
}));

jest.mock('../src/media/tempFiles', () => ({
  cleanupTempFile: jest.fn(),
}));

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
    (cleanupTempFile as jest.Mock).mockResolvedValue(undefined);
    (ImageResizer.createResizedImage as jest.Mock).mockResolvedValue({
      uri: 'file:///tmp/resized-temp.jpg',
      path: '/tmp/resized-temp.jpg',
      width: 1600,
      height: 1200,
      size: 290000,
    });
  });

  test('stores Android photos in the dedicated Dining Memory album', async () => {
    Platform.OS = 'android';
    (getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // collision check
      .mockResolvedValueOnce({ exists: true }); // file verification
    const mockAsset = { id: 'asset-1', uri: 'file:///asset.jpg' };
    const mockAlbum = { id: 'album-1' };
    (MediaLibrary.Asset.create as jest.Mock).mockResolvedValue(mockAsset);
    (MediaLibrary.Album.get as jest.Mock).mockResolvedValue(mockAlbum);

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
      location: { latitude: 35.6895, longitude: 139.6917 },
    });

    expect(copyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/resized-temp.jpg',
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
    expect(MediaLibrary.Album.get).toHaveBeenCalledWith(ANDROID_PHOTO_ALBUM_NAME);
    expect(MediaLibrary.Asset.create).toHaveBeenCalledWith(
      'file:///mock-documents/meal-20260422213507.jpg',
      mockAlbum
    );
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
    const mockNewAlbum = { id: 'album-1' };
    (MediaLibrary.Album.get as jest.Mock).mockResolvedValue(null); // Album doesn't exist
    (MediaLibrary.Album.create as jest.Mock).mockResolvedValue(mockNewAlbum);

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
    });

    expect(MediaLibrary.Album.get).toHaveBeenCalledWith(ANDROID_PHOTO_ALBUM_NAME);
    expect(MediaLibrary.Album.create).toHaveBeenCalledWith(
      ANDROID_PHOTO_ALBUM_NAME,
      ['file:///mock-documents/meal-20260422213507.jpg']
    );
    expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
    expect(result.savedToMediaLibrary).toBe(true);
  });

  test('keeps the local stable copy even if album registration fails on Android', async () => {
    Platform.OS = 'android';
    (getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // collision check
      .mockResolvedValueOnce({ exists: true }); // file verification
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    (MediaLibrary.Album.get as jest.Mock).mockRejectedValue(new Error('album failed'));

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
      from: 'file:///tmp/resized-temp.jpg',
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
      from: 'file:///tmp/resized-temp.jpg',
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

  test('falls back safely with unique suffix when collision limit is reached', async () => {
    Platform.OS = 'ios';
    // getInfoAsync always returns exists: true (simulating persistent collisions)
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

    const result = await persistPhotoToStablePath('file:///tmp/resized-photo.jpg', {
      capturedAt,
    });

    expect(result.stablePhotoUri).toMatch(
      /^file:\/\/\/mock-documents\/meal-20260422213507-fallback-[0-9a-f-]+\.jpg$/
    );
    // 100 collision checks + 1 file verification check = 101 calls
    expect(getInfoAsync).toHaveBeenCalledTimes(101);
  });

  describe('native resize and fallback pipeline', () => {
    test('resizes photo to max 1600px, JPEG quality 80, contain mode, onlyScaleDown: true before stable copy and EXIF write', async () => {
      Platform.OS = 'ios';
      (getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ exists: false }) // collision check
        .mockResolvedValueOnce({ exists: true }); // file verification

      const result = await persistPhotoToStablePath('file:///tmp/raw-camera-photo.jpg', {
        capturedAt,
        location: { latitude: 35.6895, longitude: 139.6917 },
        softwareName: 'Dining Memory',
      });

      // 1. Native resize is performed first with expected parameters
      expect(ImageResizer.createResizedImage).toHaveBeenCalledWith(
        'file:///tmp/raw-camera-photo.jpg',
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
      expect(CAMERA_CONSTANTS.SAVED_PHOTO_MAX_WIDTH).toBe(1600);
      expect(CAMERA_CONSTANTS.SAVED_PHOTO_MAX_HEIGHT).toBe(1600);
      expect(CAMERA_CONSTANTS.SAVED_PHOTO_QUALITY_PERCENT).toBe(80);

      // 2. Resized temp file is copied to destination
      expect(copyAsync).toHaveBeenCalledWith({
        from: 'file:///tmp/resized-temp.jpg',
        to: 'file:///mock-documents/meal-20260422213507.jpg',
      });

      // 3. EXIF is written to destination (the downsized copy)
      expect(writePhotoExifToJpeg).toHaveBeenCalledWith(
        'file:///mock-documents/meal-20260422213507.jpg',
        expect.objectContaining({
          capturedAt,
          location: { latitude: 35.6895, longitude: 139.6917 },
          softwareName: 'Dining Memory',
        })
      );

      // 4. Temporary resized file is cleaned up
      expect(cleanupTempFile).toHaveBeenCalledWith('file:///tmp/resized-temp.jpg');

      expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
    });

    test('falls back safely to copying original image when native resize fails, preserving persistence', async () => {
      Platform.OS = 'ios';
      (getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ exists: false }) // collision check
        .mockResolvedValueOnce({ exists: true }); // file verification
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
      (ImageResizer.createResizedImage as jest.Mock).mockRejectedValueOnce(
        new Error('Out of memory during native resize')
      );

      const result = await persistPhotoToStablePath('file:///tmp/raw-camera-photo.jpg', {
        capturedAt,
      });

      // Warning logged for resize failure
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Photo native resize failed, falling back to original image:',
        expect.any(Error)
      );

      // Falls back to copying original file
      expect(copyAsync).toHaveBeenCalledWith({
        from: 'file:///tmp/raw-camera-photo.jpg',
        to: 'file:///mock-documents/meal-20260422213507.jpg',
      });

      // EXIF is still updated on destination
      expect(writePhotoExifToJpeg).toHaveBeenCalledWith(
        'file:///mock-documents/meal-20260422213507.jpg',
        expect.objectContaining({ capturedAt })
      );

      // Original raw photo is not cleaned up by photoStorage
      expect(cleanupTempFile).not.toHaveBeenCalledWith('file:///tmp/raw-camera-photo.jpg');

      expect(result.stablePhotoUri).toBe('file:///mock-documents/meal-20260422213507.jpg');
      consoleWarnSpy.mockRestore();
    });

    test('does not cleanup source photoUri if resized URI is identical to source URI', async () => {
      Platform.OS = 'ios';
      (getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ exists: false }) // collision check
        .mockResolvedValueOnce({ exists: true }); // file verification
      (ImageResizer.createResizedImage as jest.Mock).mockResolvedValueOnce({
        uri: 'file:///tmp/raw-camera-photo.jpg',
      });

      await persistPhotoToStablePath('file:///tmp/raw-camera-photo.jpg', {
        capturedAt,
      });

      expect(cleanupTempFile).not.toHaveBeenCalledWith('file:///tmp/raw-camera-photo.jpg');
    });
  });

  describe('resolveThumbnailDestinationUri', () => {
    test('appends -thumb before .jpg extension', () => {
      expect(resolveThumbnailDestinationUri('file:///docs/meal-20260422213507.jpg')).toBe(
        'file:///docs/meal-20260422213507-thumb.jpg'
      );
      expect(resolveThumbnailDestinationUri('file:///docs/meal-20260422213507-1.jpg')).toBe(
        'file:///docs/meal-20260422213507-1-thumb.jpg'
      );
    });

    test('handles uppercase or missing extension gracefully', () => {
      expect(resolveThumbnailDestinationUri('file:///docs/meal-20260422213507.JPG')).toBe(
        'file:///docs/meal-20260422213507-thumb.jpg'
      );
      expect(resolveThumbnailDestinationUri('file:///docs/meal-photo')).toBe(
        'file:///docs/meal-photo-thumb.jpg'
      );
    });

    test('handles .jpeg and .JPEG extensions case-insensitively', () => {
      expect(resolveThumbnailDestinationUri('file:///docs/meal-20260422213507.jpeg')).toBe(
        'file:///docs/meal-20260422213507-thumb.jpg'
      );
      expect(resolveThumbnailDestinationUri('file:///docs/meal-20260422213507.JPEG')).toBe(
        'file:///docs/meal-20260422213507-thumb.jpg'
      );
      expect(resolveThumbnailDestinationUri('file:///docs/meal.photo.with.dots.jpg')).toBe(
        'file:///docs/meal.photo.with.dots-thumb.jpg'
      );
    });
  });

  describe('persistThumbnailToStablePath', () => {
    test('copies thumbnail to stable document path without EXIF or album save', async () => {
      Platform.OS = 'android';
      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      const stableThumbnail = await persistThumbnailToStablePath(
        'file:///tmp/resized-thumb.jpg',
        'file:///mock-documents/meal-20260422213507.jpg'
      );

      expect(copyAsync).toHaveBeenCalledWith({
        from: 'file:///tmp/resized-thumb.jpg',
        to: 'file:///mock-documents/meal-20260422213507-thumb.jpg',
      });
      expect(writePhotoExifToJpeg).not.toHaveBeenCalled();
      expect(MediaLibrary.Album.get).not.toHaveBeenCalled();
      expect(MediaLibrary.Asset.create).not.toHaveBeenCalled();
      expect(stableThumbnail).toBe('file:///mock-documents/meal-20260422213507-thumb.jpg');
    });

    test('throws error if copyAsync fails', async () => {
      (copyAsync as jest.Mock).mockRejectedValue(new Error('disk full'));

      await expect(
        persistThumbnailToStablePath(
          'file:///tmp/resized-thumb.jpg',
          'file:///mock-documents/meal-20260422213507.jpg'
        )
      ).rejects.toThrow('Failed to copy thumbnail to stable path: disk full');
    });

    test('throws error if destination file does not exist after copy', async () => {
      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await expect(
        persistThumbnailToStablePath(
          'file:///tmp/resized-thumb.jpg',
          'file:///mock-documents/meal-20260422213507.jpg'
        )
      ).rejects.toThrow('Thumbnail copy completed but file not found');
    });
  });
});
