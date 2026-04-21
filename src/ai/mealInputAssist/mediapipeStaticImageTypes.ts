import type { MealInputAssistProviderResult } from './types';

export interface MediaPipeStaticImageCategory {
  label: string;
  score?: number | null;
  index?: number | null;
  displayName?: string | null;
}

export interface MediaPipeStaticImageRawResult {
  photoUri: string;
  categories: Array<MediaPipeStaticImageCategory | null | undefined>;
  classifierName?: string | null;
  modelVersion?: string | null;
}

export interface MediaPipeStaticImageClassifierStatus {
  kind: 'ready' | 'unavailable';
  reason?: string;
}

export interface MediaPipeStaticImageNormalizedMetadata {
  categoryCount: number;
  matchedCategoryCount: number;
  droppedCategoryCount: number;
  topCategoryLabel?: string;
  topCategoryScore?: number;
  classifierName?: string | null;
  modelVersion?: string | null;
}

export interface MediaPipeStaticImageNormalizedResult {
  providerResult: MealInputAssistProviderResult;
  metadata: MediaPipeStaticImageNormalizedMetadata;
}

export interface MediaPipeStaticImageClassifier {
  classifyStaticImage: (photoUri: string) => Promise<MediaPipeStaticImageRawResult>;
}
