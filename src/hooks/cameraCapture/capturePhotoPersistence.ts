import { persistPhotoToStablePath, type PersistPhotoOptions } from '../../media/photoStorage';

export type PersistedCapturePhotoWithResizeInfo = Awaited<
  ReturnType<typeof persistPhotoToStablePath>
> & {
  resizedPhotoUri: string;
  stableThumbnailUri?: string;
};

export async function persistCapturePhotoLocally(
  photoUri: string,
  options: PersistPhotoOptions
): Promise<PersistedCapturePhotoWithResizeInfo> {
  const persistedPhoto = await persistPhotoToStablePath(photoUri, options);

  return {
    ...persistedPhoto,
    resizedPhotoUri: persistedPhoto.stablePhotoUri,
    stableThumbnailUri: undefined,
  };
}
