import { NativeModules, Platform } from 'react-native';
import { normalizeMediaPipeStaticImageResult } from './mediapipeStaticImageNormalizer';
import type {
  MediaPipeStaticImageClassifier,
  MediaPipeStaticImageClassifierStatus,
  MediaPipeStaticImageRawResult,
} from './mediapipeStaticImageTypes';
import type {
  MealInputAssistProvider,
  MealInputAssistProviderResult,
  MealInputAssistRequest,
  MealInputAssistRuntimeAvailability,
  MealInputAssistRuntimeUnavailableCode,
} from './types';

const MEDIAPIPE_STATIC_IMAGE_MODE = 'mediapipe-static-image' as const;
const MEDIAPIPE_MODEL_MISSING_REASON_PREFIX = 'MediaPipe meal input assist model asset が見つかりません:';

type MediaPipeMealInputAssistNativeModule = {
  getClassifierStatus?: () => Promise<MediaPipeStaticImageClassifierStatus>;
  classifyStaticImage?: (photoUri: string) => Promise<MediaPipeStaticImageRawResult>;
};

function getMediaPipeMealInputAssistNativeModule() {
  return NativeModules.MediaPipeMealInputAssist as MediaPipeMealInputAssistNativeModule | undefined;
}

function createUnavailableAvailability(
  code: MealInputAssistRuntimeUnavailableCode,
  reason: string
): MealInputAssistRuntimeAvailability {
  return {
    kind: 'unavailable',
    mode: MEDIAPIPE_STATIC_IMAGE_MODE,
    code,
    reason,
  };
}

function getUnsupportedPlatformReason() {
  return 'MediaPipe static-image classifier は Android native bridge が必要なため、この platform ではまだ利用できません。';
}

function getMissingBridgeReason() {
  return 'この build には MediaPipe static-image classifier bridge がまだ組み込まれていません。';
}

function getUnavailableCode(status: MediaPipeStaticImageClassifierStatus) {
  if (status.reason?.startsWith(MEDIAPIPE_MODEL_MISSING_REASON_PREFIX)) {
    return 'model_unavailable' as const;
  }

  return 'runtime_unavailable' as const;
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
    return createUnavailableAvailability('runtime_unavailable', getUnsupportedPlatformReason());
  }

  const nativeModule = getMediaPipeMealInputAssistNativeModule();
  if (
    !nativeModule
    || typeof nativeModule.classifyStaticImage !== 'function'
    || typeof nativeModule.getClassifierStatus !== 'function'
  ) {
    return createUnavailableAvailability('runtime_unavailable', getMissingBridgeReason());
  }

  const classifierStatus = await nativeModule.getClassifierStatus();
  if (classifierStatus.kind === 'unavailable') {
    return createUnavailableAvailability(
      getUnavailableCode(classifierStatus),
      classifierStatus.reason ?? getMissingBridgeReason()
    );
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
