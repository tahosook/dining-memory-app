import {
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import piexif, { type ExifData } from 'piexifjs';

export interface PhotoLocationSnapshot {
  latitude?: number;
  longitude?: number;
}

export interface PhotoExifContext {
  capturedAt: Date;
  location?: PhotoLocationSnapshot;
  softwareName: string;
}

type Rational = [number, number];

const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

function padNumber(value: number, width = 2) {
  return value.toString().padStart(width, '0');
}

export function formatPhotoTimestampForFilename(date: Date) {
  return [
    padNumber(date.getFullYear(), 4),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate()),
    padNumber(date.getHours()),
    padNumber(date.getMinutes()),
    padNumber(date.getSeconds()),
  ].join('');
}

export function buildMealPhotoFileName(date: Date, collisionIndex = 0) {
  const timestamp = formatPhotoTimestampForFilename(date);
  const suffix = collisionIndex > 0 ? `-${collisionIndex}` : '';
  return `meal-${timestamp}${suffix}.jpg`;
}

function formatExifLocalDateTime(date: Date) {
  return `${padNumber(date.getFullYear(), 4)}:${padNumber(date.getMonth() + 1)}:${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`;
}

function formatExifGpsDateStamp(date: Date) {
  return `${padNumber(date.getUTCFullYear(), 4)}:${padNumber(date.getUTCMonth() + 1)}:${padNumber(date.getUTCDate())}`;
}

function hasCoordinates(location?: PhotoLocationSnapshot): location is { latitude: number; longitude: number } {
  return typeof location?.latitude === 'number' && typeof location?.longitude === 'number';
}

function toExifRational(value: number, denominator = 1): Rational {
  return [value, denominator];
}

function toExifGpsCoordinate(value: number): [Rational, Rational, Rational] {
  const absoluteValue = Math.abs(value);
  let degrees = Math.floor(absoluteValue);
  const minutesFloat = (absoluteValue - degrees) * 60;
  let minutes = Math.floor(minutesFloat);
  let secondsNumerator = Math.round((minutesFloat - minutes) * 60 * 10000);

  if (secondsNumerator >= 600000) {
    secondsNumerator = 0;
    minutes += 1;
  }

  if (minutes >= 60) {
    minutes = 0;
    degrees += 1;
  }

  return [
    toExifRational(degrees),
    toExifRational(minutes),
    toExifRational(secondsNumerator, 10000),
  ];
}

function createEmptyExifData(): ExifData {
  return {
    '0th': {},
    Exif: {},
    GPS: {},
    Interop: {},
    '1st': {},
    thumbnail: null,
  };
}

function ensureExifData(exifData?: ExifData | null): ExifData {
  return {
    '0th': { ...(exifData?.['0th'] ?? {}) },
    Exif: { ...(exifData?.Exif ?? {}) },
    GPS: { ...(exifData?.GPS ?? {}) },
    Interop: { ...(exifData?.Interop ?? {}) },
    '1st': { ...(exifData?.['1st'] ?? {}) },
    thumbnail: exifData?.thumbnail ?? null,
  };
}

function readExifDataFromJpeg(jpegDataUrl: string) {
  try {
    return ensureExifData(piexif.load(jpegDataUrl));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('exif')) {
      return createEmptyExifData();
    }

    throw error;
  }
}

function buildPhotoExifData(existingExifData: ExifData, context: PhotoExifContext) {
  const exifData = ensureExifData(existingExifData);

  exifData['0th'][piexif.ImageIFD.Software] = context.softwareName;
  exifData.Exif[piexif.ExifIFD.DateTimeOriginal] = formatExifLocalDateTime(context.capturedAt);
  exifData.Exif[piexif.ExifIFD.DateTimeDigitized] = formatExifLocalDateTime(context.capturedAt);

  if (hasCoordinates(context.location)) {
    exifData.GPS[piexif.GPSIFD.GPSLatitudeRef] = context.location.latitude >= 0 ? 'N' : 'S';
    exifData.GPS[piexif.GPSIFD.GPSLatitude] = toExifGpsCoordinate(context.location.latitude);
    exifData.GPS[piexif.GPSIFD.GPSLongitudeRef] = context.location.longitude >= 0 ? 'E' : 'W';
    exifData.GPS[piexif.GPSIFD.GPSLongitude] = toExifGpsCoordinate(context.location.longitude);
    exifData.GPS[piexif.GPSIFD.GPSDateStamp] = formatExifGpsDateStamp(context.capturedAt);
    exifData.GPS[piexif.GPSIFD.GPSTimeStamp] = [
      toExifRational(context.capturedAt.getUTCHours()),
      toExifRational(context.capturedAt.getUTCMinutes()),
      toExifRational(context.capturedAt.getUTCSeconds()),
    ];
  } else {
    exifData.GPS = {};
  }

  return exifData;
}

function toJpegDataUrl(base64: string) {
  return `${JPEG_DATA_URL_PREFIX}${base64}`;
}

function extractBase64FromJpegDataUrl(jpegDataUrl: string) {
  if (!jpegDataUrl.startsWith(JPEG_DATA_URL_PREFIX)) {
    throw new Error('Unexpected JPEG data URL format');
  }

  return jpegDataUrl.slice(JPEG_DATA_URL_PREFIX.length);
}

function stripExistingExif(jpegDataUrl: string) {
  try {
    return piexif.remove(jpegDataUrl);
  } catch {
    return jpegDataUrl;
  }
}

// Expo can capture and move JPEGs, but save-time EXIF updates on the final file
// need a JS-only writer so iOS does not require an extra native EXIF dependency.
export async function writePhotoExifToJpeg(photoUri: string, context: PhotoExifContext) {
  const jpegBase64 = await readAsStringAsync(photoUri, { encoding: EncodingType.Base64 });
  const jpegDataUrl = toJpegDataUrl(jpegBase64);
  const existingExifData = readExifDataFromJpeg(jpegDataUrl);
  const mergedExifData = buildPhotoExifData(existingExifData, context);
  const exifBytes = piexif.dump(mergedExifData);
  const updatedJpegDataUrl = piexif.insert(exifBytes, stripExistingExif(jpegDataUrl));

  await writeAsStringAsync(photoUri, extractBase64FromJpegDataUrl(updatedJpegDataUrl), {
    encoding: EncodingType.Base64,
  });

  return mergedExifData;
}
