import { NativeModules, Platform } from 'react-native';
import { normalizeMediaPipeStaticImageResult } from './mediapipeStaticImageNormalizer';
import { DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID, MEDIAPIPE_CLASSIFIER_MODELS } from './modelConfig';
import { AppSettingsService } from '../../database/services/AppSettingsService';
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
  MediaPipeClassifierModelId,
} from './types';

const MEDIAPIPE_STATIC_IMAGE_MODE = 'mediapipe-static-image' as const;
const MEDIAPIPE_MODEL_MISSING_ASSET_REASON_PREFIX =
  'MediaPipe meal input assist model asset が見つかりません:';
const MEDIAPIPE_MODEL_MISSING_FILE_REASON_PREFIX =
  'MediaPipe meal input assist model file が見つかりません:';

export type MediaPipeMealInputAssistNativeModule = {
  getClassifierStatus?: () => Promise<MediaPipeStaticImageClassifierStatus>;
  getClassifierStatusForModel?: (modelId: string) => Promise<MediaPipeStaticImageClassifierStatus>;
  classifyStaticImage?: (photoUri: string) => Promise<MediaPipeStaticImageRawResult>;
  classifyStaticImageWithModel?: (
    photoUri: string,
    modelId: string
  ) => Promise<MediaPipeStaticImageRawResult>;
  verifyFileSha256?: (filePathOrUri: string, expectedSha256: string) => Promise<boolean>;
  computeFileSha256?: (filePathOrUri: string) => Promise<string>;
};

export function getMediaPipeMealInputAssistNativeModule() {
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
  if (
    status.reason?.startsWith(MEDIAPIPE_MODEL_MISSING_ASSET_REASON_PREFIX) ||
    status.reason?.startsWith(MEDIAPIPE_MODEL_MISSING_FILE_REASON_PREFIX)
  ) {
    return 'model_unavailable' as const;
  }

  return 'runtime_unavailable' as const;
}

export class MediaPipeStaticImageNativeModuleClassifier implements MediaPipeStaticImageClassifier {
  constructor(
    private readonly nativeModule: Pick<
      MediaPipeMealInputAssistNativeModule,
      'classifyStaticImage' | 'classifyStaticImageWithModel'
    >,
    private readonly modelId?: MediaPipeClassifierModelId
  ) {}

  async classifyStaticImage(photoUri: string): Promise<MediaPipeStaticImageRawResult> {
    const activeModelId =
      this.modelId ??
      (await AppSettingsService.getMediaPipeClassifierModelId?.().catch(() => null)) ??
      DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID;

    if (typeof this.nativeModule.classifyStaticImageWithModel === 'function') {
      return this.nativeModule.classifyStaticImageWithModel(photoUri, activeModelId);
    }
    if (typeof this.nativeModule.classifyStaticImage === 'function') {
      return this.nativeModule.classifyStaticImage(photoUri);
    }
    throw new Error('classifyStaticImage is not available on native module.');
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

export async function getMediaPipeStaticImageAvailability(
  modelId?: MediaPipeClassifierModelId
): Promise<MealInputAssistRuntimeAvailability> {
  if (Platform.OS !== 'android') {
    return createUnavailableAvailability('runtime_unavailable', getUnsupportedPlatformReason());
  }

  const nativeModule = getMediaPipeMealInputAssistNativeModule();
  if (
    !nativeModule ||
    (typeof nativeModule.classifyStaticImage !== 'function' &&
      typeof nativeModule.classifyStaticImageWithModel !== 'function') ||
    (typeof nativeModule.getClassifierStatus !== 'function' &&
      typeof nativeModule.getClassifierStatusForModel !== 'function')
  ) {
    return createUnavailableAvailability('runtime_unavailable', getMissingBridgeReason());
  }

  const resolvedModelId: MediaPipeClassifierModelId =
    modelId ??
    (await AppSettingsService.getMediaPipeClassifierModelId?.().catch(() => null)) ??
    DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID;

  const classifierStatus =
    typeof nativeModule.getClassifierStatusForModel === 'function'
      ? await nativeModule.getClassifierStatusForModel(resolvedModelId)
      : typeof nativeModule.getClassifierStatus === 'function'
        ? await nativeModule.getClassifierStatus()
        : { kind: 'unavailable' as const, reason: getMissingBridgeReason() };

  if (classifierStatus.kind === 'unavailable') {
    return createUnavailableAvailability(
      getUnavailableCode(classifierStatus),
      classifierStatus.reason ?? getMissingBridgeReason()
    );
  }

  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[resolvedModelId];
  const description =
    resolvedModelId === DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID
      ? 'MediaPipe static-image meal input assist provider'
      : `MediaPipe static-image meal input assist provider (${modelMeta?.label ?? resolvedModelId})`;

  return {
    kind: 'ready',
    mode: MEDIAPIPE_STATIC_IMAGE_MODE,
    description,

    provider: new MediaPipeStaticImageMealInputAssistProvider(
      new MediaPipeStaticImageNativeModuleClassifier(nativeModule, modelId)
    ),
  };
}
