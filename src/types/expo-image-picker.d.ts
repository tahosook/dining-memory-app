declare module 'expo-image-picker' {
  export type ImagePickerAsset = {
    uri: string;
    width?: number;
    height?: number;
    fileName?: string | null;
    exif?: Record<string, unknown> | null;
  };

  export type ImagePickerResult =
    | { canceled: true; assets: [] }
    | { canceled: false; assets: ImagePickerAsset[] };

  export function launchImageLibraryAsync(options: {
    mediaTypes: string[];
    allowsMultipleSelection: boolean;
    exif: boolean;
    quality: number;
  }): Promise<ImagePickerResult>;
}
