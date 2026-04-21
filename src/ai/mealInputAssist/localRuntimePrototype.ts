import { getInfoAsync } from 'expo-file-system/legacy';
import { initLlama, type LlamaContext } from 'llama.rn';
import { NativeModules, Platform } from 'react-native';
import { CUISINE_TYPE_OPTIONS } from '../../constants/MealOptions';
import {
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
} from './modelConfig';
import { createUnavailableRuntimeAvailability } from './runtimeAvailability';
import type {
  MealInputAssistProgressUpdate,
  MealInputAssistProvider,
  MealInputAssistProviderResult,
  MealInputAssistRequest,
  MealInputAssistRuntimeAvailability,
  MealInputAssistSuggestOptions,
} from './types';

export {
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
} from './modelConfig';

const LOCAL_MEAL_INPUT_ASSIST_SOURCE = 'local-meal-input-assist';
const SUPPORTED_ANDROID_ABIS = new Set(['arm64-v8a', 'x86_64']);
const LOCAL_RUNTIME_CONTEXT_SIZE = 4096;
const LOCAL_RUNTIME_BATCH_SIZE = 128;
const LOCAL_RUNTIME_IMAGE_MAX_TOKENS = 224;
const LOCAL_RUNTIME_MAX_PREDICT = 96;
const LOCAL_RUNTIME_EXPECTED_TOKEN_COUNT = 48;

type PlatformConstantsWithSupportedAbis = {
  SupportedAbis?: string[];
  supportedAbis?: string[];
};

function getSupportedAndroidAbis() {
  const constants = NativeModules.PlatformConstants as PlatformConstantsWithSupportedAbis | undefined;
  return constants?.SupportedAbis ?? constants?.supportedAbis ?? [];
}

function hasSupportedAndroidAbi() {
  const supportedAbis = getSupportedAndroidAbis();
  if (!supportedAbis.length) {
    return true;
  }

  return supportedAbis.some((abi) => SUPPORTED_ANDROID_ABIS.has(abi));
}

function hasLlamaNativeModule() {
  return typeof NativeModules.RNLlama?.install === 'function';
}

function getUnsupportedRuntimeReason() {
  if (Platform.OS === 'web') {
    return 'Web build では端末内 AI 入力補助を利用できません。';
  }

  return 'この build には端末内 AI runtime がまだ組み込まれていません。';
}

function buildMealInputAssistUserPrompt(request: MealInputAssistRequest) {
  const currentMealName = request.mealName?.trim() || '未入力';
  const currentCuisineType = request.cuisineType?.trim() || '未入力';
  const currentLocationName = request.locationName?.trim() || '未入力';
  const currentNotes = request.notes?.trim() || '未入力';
  const currentHomemade = typeof request.isHomemade === 'boolean'
    ? request.isHomemade ? '自炊' : '外食'
    : '未入力';

  return [
    'あなたは食事記録アプリの AI 入力補助です。',
    '写真を見て、保存候補だけを JSON で返してください。',
    '説明文、前置き、コードブロックは禁止です。JSON オブジェクトだけを返してください。',
    '不明な項目は空配列にしてください。',
    `料理ジャンルは ${CUISINE_TYPE_OPTIONS.join(' / ')} のみを使ってください。`,
    '自炊判定は 自炊 または 外食 のみを使ってください。',
    '候補は短く自然な日本語にしてください。',
    '返答フォーマット:',
    '{"mealNames":[{"value":"料理名","confidence":0.0}],"cuisineTypes":[{"value":"和食","confidence":0.0}],"homemade":[{"value":"自炊","confidence":0.0}]}',
    '現在の入力:',
    `- 料理名: ${currentMealName}`,
    `- 料理ジャンル: ${currentCuisineType}`,
    `- 場所: ${currentLocationName}`,
    `- メモ: ${currentNotes}`,
    `- 自炊判定: ${currentHomemade}`,
  ].join('\n');
}

function buildMealInputAssistMessages(request: MealInputAssistRequest) {
  return [
    {
      role: 'system' as const,
      content: 'あなたは食事記録アプリの AI 入力補助です。返答は JSON オブジェクトだけにしてください。',
    },
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: buildMealInputAssistUserPrompt(request),
        },
        {
          type: 'image_url' as const,
          image_url: {
            url: request.photoUri,
          },
        },
      ],
    },
  ];
}

function extractJsonText(text: string | null | undefined) {
  if (typeof text !== 'string') {
    throw new Error('Meal input assist response was empty.');
  }

  const trimmed = text.trim();
  const withoutFences = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
    : trimmed;
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error('Meal input assist response did not include JSON.');
  }

  return withoutFences.slice(start, end + 1);
}

function parseMealInputAssistResponse(text: string | null | undefined): MealInputAssistProviderResult {
  const parsed = JSON.parse(extractJsonText(text)) as {
    mealNames?: Array<{ value?: string; confidence?: number }>;
    cuisineTypes?: Array<{ value?: string; confidence?: number }>;
    homemade?: Array<{ value?: '自炊' | '外食'; confidence?: number }>;
  };
  const mealNames = (parsed.mealNames ?? []).filter(
    (candidate): candidate is { value: string; confidence?: number } => typeof candidate.value === 'string'
  );
  const cuisineTypes = (parsed.cuisineTypes ?? []).filter(
    (candidate): candidate is { value: string; confidence?: number } => typeof candidate.value === 'string'
  );
  const homemade = (parsed.homemade ?? []).filter(
    (candidate): candidate is { value: '自炊' | '外食'; confidence?: number } =>
      candidate.value === '自炊' || candidate.value === '外食'
  );

  return {
    source: LOCAL_MEAL_INPUT_ASSIST_SOURCE,
    mealNames,
    cuisineTypes,
    homemade,
  };
}

function countProviderCandidates(result: MealInputAssistProviderResult) {
  return {
    mealNames: result.mealNames?.length ?? 0,
    cuisineTypes: result.cuisineTypes?.length ?? 0,
    homemade: result.homemade?.length ?? 0,
  };
}

function hasAnyProviderCandidates(result: MealInputAssistProviderResult) {
  const counts = countProviderCandidates(result);
  return counts.mealNames > 0 || counts.cuisineTypes > 0 || counts.homemade > 0;
}

function buildResponsePreview(text: string, maxLength = 240) {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }

  return `${singleLine.slice(0, maxLength - 1)}...`;
}

function getCompletionResponseText(completion: {
  text?: string | null;
  content?: string | null;
  tokens_predicted?: number;
  tokens_evaluated?: number;
  stopped_eos?: boolean;
  interrupted?: boolean;
  context_full?: boolean;
  truncated?: boolean;
  stopped_limit?: number;
  stopped_word?: string;
  stopping_word?: string;
}) {
  const responseText = [completion.content, completion.text]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (responseText) {
    return responseText;
  }

  throw new Error(
    [
      'Meal input assist response was empty.',
      `tokens_predicted=${completion.tokens_predicted ?? 'unknown'}`,
      `tokens_evaluated=${completion.tokens_evaluated ?? 'unknown'}`,
      `stopped_eos=${completion.stopped_eos ?? 'unknown'}`,
      `interrupted=${completion.interrupted ?? 'unknown'}`,
      `context_full=${completion.context_full ?? 'unknown'}`,
      `truncated=${completion.truncated ?? 'unknown'}`,
      `stopped_limit=${completion.stopped_limit ?? 'unknown'}`,
      `stopped_word=${completion.stopped_word ?? 'unknown'}`,
      `stopping_word=${completion.stopping_word ?? 'unknown'}`,
    ].join(' ')
  );
}

function clampProgress(progress: number | null) {
  if (progress === null || Number.isNaN(progress)) {
    return null;
  }

  return Math.max(0, Math.min(1, progress));
}

function reportSuggestProgress(
  onProgress: ((progress: MealInputAssistProgressUpdate) => void) | undefined,
  progress: MealInputAssistProgressUpdate
) {
  onProgress?.({
    ...progress,
    progress: clampProgress(progress.progress),
  });
}

class LlamaMultimodalContextLoader {
  private contextPromise: Promise<LlamaContext> | null = null;
  private isContextReady = false;

  constructor(
    private readonly modelPath: string,
    private readonly projectorPath: string
  ) {}

  private async createContext(onProgress?: (progress: MealInputAssistProgressUpdate) => void) {
    reportSuggestProgress(onProgress, {
      stage: 'loading_model',
      message: 'AI model を読み込んでいます。初回は時間がかかることがあります。',
      progress: 0.08,
      estimatedRemainingMs: 45000,
    });

    const context = await initLlama({
      model: this.modelPath,
      n_ctx: LOCAL_RUNTIME_CONTEXT_SIZE,
      n_batch: LOCAL_RUNTIME_BATCH_SIZE,
      ctx_shift: false,
      use_mmap: true,
    }, (progress) => {
      reportSuggestProgress(onProgress, {
        stage: 'loading_model',
        message: 'AI model を読み込んでいます。初回は時間がかかることがあります。',
        progress: 0.08 + (progress / 100) * 0.42,
        estimatedRemainingMs: Math.max(5000, Math.round(((100 - progress) / 100) * 45000)),
      });
    });

    reportSuggestProgress(onProgress, {
      stage: 'initializing_multimodal',
      message: '画像解析の準備をしています。',
      progress: 0.54,
      estimatedRemainingMs: 20000,
    });
    const initialized = await context.initMultimodal({
      path: this.projectorPath,
      image_max_tokens: LOCAL_RUNTIME_IMAGE_MAX_TOKENS,
    });
    if (!initialized) {
      throw new Error('Multimodal projector could not be initialized.');
    }

    const support = await context.getMultimodalSupport();
    if (!support.vision) {
      throw new Error('Vision input is not supported by the configured multimodal runtime.');
    }

    this.isContextReady = true;
    return context;
  }

  async load(onProgress?: (progress: MealInputAssistProgressUpdate) => void) {
    if (!this.contextPromise) {
      this.contextPromise = this.createContext(onProgress).catch((error) => {
        this.contextPromise = null;
        this.isContextReady = false;
        throw error;
      });
    } else if (this.isContextReady) {
      reportSuggestProgress(onProgress, {
        stage: 'analyzing_photo',
        message: 'AI model の準備は完了しています。写真を解析します。',
        progress: 0.64,
        estimatedRemainingMs: 12000,
      });
    }

    return this.contextPromise;
  }
}

export class LocalRuntimePrototypeMealInputAssistProvider implements MealInputAssistProvider {
  private readonly contextLoader: LlamaMultimodalContextLoader;

  constructor(modelPath: string, projectorPath: string) {
    this.contextLoader = new LlamaMultimodalContextLoader(modelPath, projectorPath);
  }

  async suggest(
    request: MealInputAssistRequest,
    options?: MealInputAssistSuggestOptions
  ): Promise<MealInputAssistProviderResult> {
    const context = await this.contextLoader.load(options?.onProgress);
    reportSuggestProgress(options?.onProgress, {
      stage: 'analyzing_photo',
      message: '写真を解析しています。',
      progress: 0.7,
      estimatedRemainingMs: 12000,
    });
    await context.clearCache();

    let emittedTokens = 0;
    const completion = await context.completion({
      messages: buildMealInputAssistMessages(request),
      temperature: 0.2,
      n_predict: LOCAL_RUNTIME_MAX_PREDICT,
    }, () => {
      emittedTokens += 1;
      const tokenProgress = Math.min(emittedTokens / LOCAL_RUNTIME_EXPECTED_TOKEN_COUNT, 1);
      reportSuggestProgress(options?.onProgress, {
        stage: 'generating_response',
        message: '候補を整理しています。',
        progress: 0.8 + tokenProgress * 0.16,
        estimatedRemainingMs: Math.max(1000, Math.round((1 - tokenProgress) * 10000)),
      });
    });

    reportSuggestProgress(options?.onProgress, {
      stage: 'finalizing',
      message: '候補を整形しています。',
      progress: 0.98,
      estimatedRemainingMs: 1000,
    });

    const responseText = getCompletionResponseText(completion);
    const parsedResponse = parseMealInputAssistResponse(responseText);

    if (!hasAnyProviderCandidates(parsedResponse)) {
      console.info('Meal input assist model response contained no provider candidates.', {
        candidateCounts: countProviderCandidates(parsedResponse),
        tokensPredicted: completion.tokens_predicted ?? null,
        tokensEvaluated: completion.tokens_evaluated ?? null,
        rawResponsePreview: buildResponsePreview(responseText),
      });
    }

    return parsedResponse;
  }
}

async function getRequiredPathAvailability(path: string | null, missingReason: string) {
  if (!path) {
    return {
      kind: 'unavailable' as const,
      reason: missingReason,
    };
  }

  const info = await getInfoAsync(path);
  if (!info.exists) {
    return {
      kind: 'unavailable' as const,
      reason: missingReason,
    };
  }

  return {
    kind: 'ready' as const,
    path,
  };
}

export async function getLocalRuntimePrototypeAvailability(): Promise<MealInputAssistRuntimeAvailability> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return createUnavailableRuntimeAvailability(
      'runtime_unavailable',
      getUnsupportedRuntimeReason()
    );
  }

  if (!hasLlamaNativeModule()) {
    return createUnavailableRuntimeAvailability(
      'runtime_unavailable',
      getUnsupportedRuntimeReason()
    );
  }

  if (Platform.OS === 'android' && !hasSupportedAndroidAbi()) {
    return createUnavailableRuntimeAvailability(
      'unsupported_architecture',
      'この Android ABI では端末内 AI 入力補助を利用できません。'
    );
  }

  const [modelAvailability, projectorAvailability] = await Promise.all([
    getRequiredPathAvailability(
      resolveMealInputAssistModelPath(),
      `meal input assist model が見つかりません: ${resolveMealInputAssistModelPath() ?? 'unresolved'}`
    ),
    getRequiredPathAvailability(
      resolveMealInputAssistProjectorPath(),
      `meal input assist projector が見つかりません: ${resolveMealInputAssistProjectorPath() ?? 'unresolved'}`
    ),
  ]);

  if (modelAvailability.kind === 'unavailable') {
    return createUnavailableRuntimeAvailability('model_unavailable', modelAvailability.reason);
  }

  if (projectorAvailability.kind === 'unavailable') {
    return createUnavailableRuntimeAvailability('model_unavailable', projectorAvailability.reason);
  }

  return {
    kind: 'ready',
    mode: 'local-runtime-prototype',
    description: 'Local multimodal meal input assist provider',
    provider: new LocalRuntimePrototypeMealInputAssistProvider(
      modelAvailability.path,
      projectorAvailability.path
    ),
  };
}
