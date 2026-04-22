declare module 'piexifjs' {
  export interface ExifData {
    '0th': Record<number, unknown>;
    Exif: Record<number, unknown>;
    GPS: Record<number, unknown>;
    Interop: Record<number, unknown>;
    '1st': Record<number, unknown>;
    thumbnail: string | null;
  }

  export const ImageIFD: {
    Orientation: number;
    Software: number;
  };

  export const ExifIFD: {
    DateTimeOriginal: number;
    DateTimeDigitized: number;
  };

  export const GPSIFD: {
    GPSLatitudeRef: number;
    GPSLatitude: number;
    GPSLongitudeRef: number;
    GPSLongitude: number;
    GPSDateStamp: number;
    GPSTimeStamp: number;
  };

  export function load(jpegData: string): ExifData;
  export function dump(exifData: ExifData): string;
  export function insert(exifBytes: string, jpegData: string): string;
  export function remove(jpegData: string): string;

  const piexif: {
    ImageIFD: typeof ImageIFD;
    ExifIFD: typeof ExifIFD;
    GPSIFD: typeof GPSIFD;
    load: typeof load;
    dump: typeof dump;
    insert: typeof insert;
    remove: typeof remove;
  };

  export default piexif;
}
