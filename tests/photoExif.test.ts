import { EncodingType, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import piexif from 'piexifjs';
import { writePhotoExifToJpeg } from '../src/hooks/cameraCapture/photoExif';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: {
    Base64: 'base64',
  },
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

jest.mock('piexifjs', () => ({
  __esModule: true,
  default: {
    ImageIFD: {
      Orientation: 274,
      Software: 305,
    },
    ExifIFD: {
      DateTimeOriginal: 36867,
      DateTimeDigitized: 36868,
      ExposureTime: 33434,
    },
    GPSIFD: {
      GPSLatitudeRef: 1,
      GPSLatitude: 2,
      GPSLongitudeRef: 3,
      GPSLongitude: 4,
      GPSTimeStamp: 7,
      GPSAltitude: 6,
      GPSDateStamp: 29,
    },
    load: jest.fn(),
    dump: jest.fn(),
    insert: jest.fn(),
    remove: jest.fn(),
  },
}));

describe('photoExif', () => {
  const capturedAt = new Date(2026, 3, 22, 21, 35, 7);

  beforeEach(() => {
    jest.clearAllMocks();
    (readAsStringAsync as jest.Mock).mockResolvedValue('ORIGINAL_BASE64');
    (piexif.dump as jest.Mock).mockReturnValue('EXIF_BYTES');
    (piexif.remove as jest.Mock).mockReturnValue('data:image/jpeg;base64,STRIPPED_BASE64');
    (piexif.insert as jest.Mock).mockReturnValue('data:image/jpeg;base64,UPDATED_BASE64');
  });

  test('merges capture timestamp, software, GPS tags, and preserves existing EXIF fields', async () => {
    (piexif.load as jest.Mock).mockReturnValue({
      '0th': {
        274: 6,
        315: 'Original Artist',
      },
      Exif: {
        33434: [1, 60],
      },
      GPS: {
        6: [10, 1],
      },
      Interop: {
        1: 'R98',
      },
      '1st': {
        513: 1234,
      },
      thumbnail: 'thumb-bytes',
    });

    await writePhotoExifToJpeg('file:///photo.jpg', {
      capturedAt,
      location: { latitude: 35.6895, longitude: 139.6917 },
      softwareName: 'Dining Memory',
    });

    expect(readAsStringAsync).toHaveBeenCalledWith('file:///photo.jpg', {
      encoding: EncodingType.Base64,
    });
    expect(piexif.load).toHaveBeenCalledWith('data:image/jpeg;base64,ORIGINAL_BASE64');
    expect(piexif.remove).toHaveBeenCalledWith('data:image/jpeg;base64,ORIGINAL_BASE64');
    expect(piexif.dump).toHaveBeenCalledWith({
      '0th': {
        274: 6,
        305: 'Dining Memory',
        315: 'Original Artist',
      },
      Exif: {
        33434: [1, 60],
        36867: '2026:04:22 21:35:07',
        36868: '2026:04:22 21:35:07',
      },
      GPS: {
        1: 'N',
        2: [[35, 1], [41, 1], [222000, 10000]],
        3: 'E',
        4: [[139, 1], [41, 1], [301200, 10000]],
        6: [10, 1],
        7: [[12, 1], [35, 1], [7, 1]],
        29: '2026:04:22',
      },
      Interop: {
        1: 'R98',
      },
      '1st': {
        513: 1234,
      },
      thumbnail: 'thumb-bytes',
    });
    expect(piexif.insert).toHaveBeenCalledWith(
      'EXIF_BYTES',
      'data:image/jpeg;base64,STRIPPED_BASE64'
    );
    expect(writeAsStringAsync).toHaveBeenCalledWith('file:///photo.jpg', 'UPDATED_BASE64', {
      encoding: EncodingType.Base64,
    });
  });

  test('removes stale GPS EXIF when save-time location is unavailable', async () => {
    (piexif.load as jest.Mock).mockReturnValue({
      '0th': {
        274: 1,
      },
      Exif: {},
      GPS: {
        1: 'N',
        2: [[1, 1], [2, 1], [3, 1]],
      },
      Interop: {},
      '1st': {},
      thumbnail: null,
    });

    await writePhotoExifToJpeg('file:///photo.jpg', {
      capturedAt,
      location: {},
      softwareName: 'Dining Memory',
    });

    expect(piexif.dump).toHaveBeenCalledWith(
      expect.objectContaining({
        GPS: {},
      })
    );
  });

  test('creates EXIF from scratch when the source JPEG has no EXIF block', async () => {
    (piexif.load as jest.Mock).mockImplementation(() => {
      throw new Error('No Exif segment found');
    });

    await writePhotoExifToJpeg('file:///photo.jpg', {
      capturedAt,
      softwareName: 'Dining Memory',
    });

    expect(piexif.dump).toHaveBeenCalledWith({
      '0th': {
        305: 'Dining Memory',
      },
      Exif: {
        36867: '2026:04:22 21:35:07',
        36868: '2026:04:22 21:35:07',
      },
      GPS: {},
      Interop: {},
      '1st': {},
      thumbnail: null,
    });
  });
});
