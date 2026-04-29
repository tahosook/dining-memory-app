import ImageResizer from '@bam.tech/react-native-image-resizer';
import { copyAsync, deleteAsync } from 'expo-file-system/legacy';
import { deleteMealPhotoFileIfSafe, rotateMealPhotoClockwise } from '../src/utils/mealPhotoRotation';
import { CAMERA_CONSTANTS } from '../src/constants/CameraConstants';

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  documentDirectory: 'file:///documents/',
}));

describe('mealPhotoRotation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T10:11:12.123Z'));
    (ImageResizer.createResizedImage as jest.Mock).mockResolvedValue({
      uri: 'file:///cache/rotated-temp.jpg',
    });
    (copyAsync as jest.Mock).mockResolvedValue(undefined);
    (deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('creates a right-rotated image and copies it into documentDirectory', async () => {
    const rotatedUri = await rotateMealPhotoClockwise('file:///documents/original.jpg');

    expect(ImageResizer.createResizedImage).toHaveBeenCalledWith(
      'file:///documents/original.jpg',
      CAMERA_CONSTANTS.SAVED_PHOTO_MAX_WIDTH,
      CAMERA_CONSTANTS.SAVED_PHOTO_MAX_HEIGHT,
      'JPEG',
      CAMERA_CONSTANTS.SAVED_PHOTO_QUALITY_PERCENT,
      90,
      undefined,
      true,
      {
        mode: 'contain',
        onlyScaleDown: true,
      }
    );
    expect(rotatedUri).toBe('file:///documents/meal-photo-rotated-2026-04-20T10-11-12-123Z-1f9add37.jpg');
    expect(copyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/rotated-temp.jpg',
      to: rotatedUri,
    });
    expect(deleteAsync).toHaveBeenCalledWith('file:///cache/rotated-temp.jpg', { idempotent: true });
  });

  test('deletes only app document files when cleanup is safe', async () => {
    await deleteMealPhotoFileIfSafe('content://photos/original.jpg');
    await deleteMealPhotoFileIfSafe('https://example.com/original.jpg');
    await deleteMealPhotoFileIfSafe('file:///tmp/original.jpg');
    await deleteMealPhotoFileIfSafe('file:///documents/current.jpg', 'file:///documents/current.jpg');

    expect(deleteAsync).not.toHaveBeenCalled();

    await deleteMealPhotoFileIfSafe('file:///documents/old.jpg', 'file:///documents/new.jpg');

    expect(deleteAsync).toHaveBeenCalledWith('file:///documents/old.jpg', { idempotent: true });
  });
});
