import { NativeModules, Platform } from 'react-native';
import { normalizeMediaPipeStaticImageResult } from './mediapipeStaticImageNormalizer';
import type { MediaPipeStaticImageClassifier, MediaPipeStaticImageRawResult } from './mediapipeStaticImageTypes';
import type {
  MealInputAssistProvider,
  MealInputAssistProviderResult,
  MealInputAssistRequest,
  MealInputAssistRuntimeAvailability,
} from './types';

const MEDIAPIPE_STATIC_IMAGE_MODE = 'mediapipe-static-image' as const;

type MediaPipeMealInputAssistNativeModule = {
  classifyStaticImage?: (photoUri: string) => Promise<MediaPipeStaticImageRawResult>;
};

function getMediaPipeMealInputAssistNativeModule() {
  return NativeModules.MediaPipeMealInputAssist as MediaPipeMealInputAssistNativeModule | undefined;
}

function createUnavailableAvailability(reason: string): MealInputAssistRuntimeAvailability {
  return {
    kind: 'unavailable',
    mode: MEDIAPIPE_STATIC_IMAGE_MODE,
    code: 'runtime_unavailable',
    reason,
  };
}

function getUnsupportedPlatformReason() {
  return 'MediaPipe static-image classifier は Android native bridge が必要なため、この platform ではまだ利用できません。';
}

function getMissingBridgeReason() {
  return 'この build には MediaPipe static-image classifier bridge がまだ組み込まれていません。';
}

export class MediaPipeStaticImageNativeModuleClassifier implements MediaPipeStaticImageClassifier {
  constructor(private readonly nativeModule: Required<Pick<MediaPipeMealInputAssistNativeModule, 'classifyStaticImage'>>) {}

  async classifyStaticImage(photoUri: string): Promise<MediaPipeStaticImageRawResult> {
    return this.nativeModule.classifyStaticImage(photoUri);
  }
}

export class MediaPipeStaticImageMealInputAssistProvider implements MealInputAssistProvider {
  constructor(private readonly classifier: MediaPipeStaticImageClassifier) {}

  async suggest(request: MealInputAssistRequest): Promise<MealInputAssistProviderResult> {
    const rawResult = await this.classifier.classifyStaticImage(request.photoUri);
    const normalizedResult = normalizeMediaPipeStaticImageResult(rawResult);
    return normalizedResult.providerResult;
  }
}

export async function getMediaPipeStaticImageAvailability(): Promise<MealInputAssistRuntimeAvailability> {
  if (Platform.OS !== 'android') {
    return createUnavailableAvailability(getUnsupportedPlatformReason());
  }

  const nativeModule = getMediaPipeMealInputAssistNativeModule();
  if (!nativeModule || typeof nativeModule.classifyStaticImage !== 'function') {
    return createUnavailableAvailability(getMissingBridgeReason());
  }

  return {
    kind: 'ready',
    mode: MEDIAPIPE_STATIC_IMAGE_MODE,
    description: 'MediaPipe static-image meal input assist provider',
    provider: new MediaPipeStaticImageMealInputAssistProvider(
      new MediaPipeStaticImageNativeModuleClassifier({
        classifyStaticImage: nativeModule.classifyStaticImage.bind(nativeModule),
      })
    ),
  };
}
