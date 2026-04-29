import { getInfoAsync } from 'expo-file-system/legacy';
import { initLlama, type LlamaContext } from 'llama.rn';
import { NativeModules, Platform } from 'react-native';
import { CUISINE_TYPE_OPTIONS } from '../../constants/MealOptions';
import {
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
} from './modelConfig';
import type {
  MealInputAssistProgressUpdate,
  MealInputAssistPrewarmOptions,
  MealInputAssistProvider,
  MealInputAssistProviderResult,
  MealInputAssistRequest,
  MealInputAssistRuntimeUnavailableCode,
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
const LOCAL_RUNTIME_MODEL_LOAD_START_PROGRESS = 0.08;
const LOCAL_RUNTIME_MODEL_LOAD_END_PROGRESS = 0.54;
const LOCAL_RUNTIME_MULTIMODAL_READY_PROGRESS = 0.6;
const LOCAL_RUNTIME_CLEAR_CACHE_START_PROGRESS = 0.64;
const LOCAL_RUNTIME_CLEAR_CACHE_DONE_PROGRESS = 0.7;
const LOCAL_RUNTIME_COMPLETION_SUBMITTED_PROGRESS = 0.74;
const LOCAL_RUNTIME_GENERATION_START_PROGRESS = 0.8;
const LOCAL_RUNTIME_GENERATION_END_PROGRESS = 0.96;
const LOCAL_RUNTIME_FINALIZING_PROGRESS = 0.98;
const LOCAL_RUNTIME_MODEL_LOAD_START_ESTIMATED_REMAINING_MS = 60000;
const LOCAL_RUNTIME_MODEL_LOAD_END_ESTIMATED_REMAINING_MS = 55000;
const LOCAL_RUNTIME_MULTIMODAL_READY_ESTIMATED_REMAINING_MS = 50000;
const LOCAL_RUNTIME_CLEAR_CACHE_START_ESTIMATED_REMAINING_MS = 47000;
const LOCAL_RUNTIME_CLEAR_CACHE_DONE_ESTIMATED_REMAINING_MS = 45000;
const LOCAL_RUNTIME_COMPLETION_SUBMITTED_ESTIMATED_REMAINING_MS = 42000;
const LOCAL_RUNTIME_GENERATION_INITIAL_ESTIMATED_REMAINING_MS = 18000;
const LOCAL_RUNTIME_GENERATION_MIN_ESTIMATED_REMAINING_MS = 2000;
const LOCAL_RUNTIME_FINALIZING_ESTIMATED_REMAINING_MS = 1000;
const LOCAL_RUNTIME_MODEL_LOAD_PROGRESS_RANGE =
  LOCAL_RUNTIME_MODEL_LOAD_END_PROGRESS - LOCAL_RUNTIME_MODEL_LOAD_START_PROGRESS;
const LOCAL_RUNTIME_GENERATION_PROGRESS_RANGE =
  LOCAL_RUNTIME_GENERATION_END_PROGRESS - LOCAL_RUNTIME_GENERATION_START_PROGRESS;

type LocalRuntimePrototypeAvailability =
  | {
    kind: 'ready';
    mode: 'local-runtime-prototype';
    description: string;
    provider: MealInputAssistProvider;
  }
  | {
    kind: 'unavailable';
    mode: 'local-runtime-prototype';
    code: MealInputAssistRuntimeUnavailableCode;
    reason: string;
  };

function createLocalRuntimeUnavailableAvailability(
  code: MealInputAssistRuntimeUnavailableCode,
  reason: string
): LocalRuntimePrototypeAvailability {
  return {
    kind: 'unavailable',
    mode: 'local-runtime-prototype',
    code,
    reason,
  };
}

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

  return [
    'あなたは食事記録アプリの AI 入力補助です。',
    '写真を見て、notes 欄に追記できる食事メモ下書きだけを JSON で返してください。',
    '説明文、前置き、コードブロックは禁止です。JSON オブジェクトだけを返してください。',
    'mealName 欄を埋める候補は返さないでください。',
    'noteDraft を主出力にし、value は notes にそのまま貼れる 3〜5 行程度の日本語にしてください。',
    '「料理名:」「メモ:」「タグ:」などの見出しを使い、後で見返しやすい形にしてください。',
    '写真から断定できないことは断定せず、「〜に見える」「種類までは不明」など控えめに書いてください。',
    '食事・酒・旅行・外食・自炊・店っぽさ・季節感・量感など、写真から自然に読み取れる範囲だけを反映してください。',
    '返答フォーマット:',
    '{"noteDraft":{"value":"料理名: 刺身盛り合わせ\\nメモ: 日本酒に合いそうな海鮮居酒屋の一皿\\nタグ: #海鮮 #居酒屋 #晩酌","confidence":0.0}}',
    '現在の入力:',
    `- 料理名: ${currentMealName}`,
    `- 料理ジャンル: ${currentCuisineType}`,
    `- 利用可能な料理ジャンル参考値: ${CUISINE_TYPE_OPTIONS.join(' / ')}`,
    `- 場所: ${currentLocationName}`,
    `- メモ: ${currentNotes}`,
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
    noteDraft?: string | { value?: string; confidence?: number } | null;
    mealNames?: Array<{ value?: string; confidence?: number }>;
    cuisineTypes?: Array<{ value?: string; confidence?: number }>;
  };
  const noteDraft = typeof parsed.noteDraft === 'string'
    ? parsed.noteDraft
    : parsed.noteDraft && typeof parsed.noteDraft.value === 'string'
      ? {
        value: parsed.noteDraft.value,
        confidence: parsed.noteDraft.confidence,
      }
      : null;
  const mealNames = (parsed.mealNames ?? []).filter(
    (candidate): candidate is { value: string; confidence?: number } => typeof candidate.value === 'string'
  );
  const cuisineTypes = (parsed.cuisineTypes ?? []).filter(
    (candidate): candidate is { value: string; confidence?: number } => typeof candidate.value === 'string'
  );

  return {
    source: LOCAL_MEAL_INPUT_ASSIST_SOURCE,
    noteDraft,
    mealNames,
    cuisineTypes,
  };
}

function countProviderCandidates(result: MealInputAssistProviderResult) {
  return {
    noteDraft: result.noteDraft ? 1 : 0,
    mealNames: result.mealNames?.length ?? 0,
    cuisineTypes: result.cuisineTypes?.length ?? 0,
  };
}

function hasAnyProviderCandidates(result: MealInputAssistProviderResult) {
  const counts = countProviderCandidates(result);
  return counts.noteDraft > 0 || counts.mealNames > 0 || counts.cuisineTypes > 0;
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

function estimateModelLoadRemainingMs(progressPercentage: number) {
  const normalizedProgress = Math.max(0, Math.min(100, progressPercentage));
  const remainingMs =
    LOCAL_RUNTIME_MODEL_LOAD_START_ESTIMATED_REMAINING_MS
    - (
      (normalizedProgress / 100)
      * (
        LOCAL_RUNTIME_MODEL_LOAD_START_ESTIMATED_REMAINING_MS
        - LOCAL_RUNTIME_MODEL_LOAD_END_ESTIMATED_REMAINING_MS
      )
    );

  return Math.round(remainingMs);
}

function estimateGenerationRemainingMs(tokenProgress: number) {
  const normalizedProgress = Math.max(0, Math.min(1, tokenProgress));
  return Math.max(
    LOCAL_RUNTIME_GENERATION_MIN_ESTIMATED_REMAINING_MS,
    Math.round(LOCAL_RUNTIME_GENERATION_INITIAL_ESTIMATED_REMAINING_MS * (1 - normalizedProgress))
  );
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
      progress: LOCAL_RUNTIME_MODEL_LOAD_START_PROGRESS,
      estimatedRemainingMs: LOCAL_RUNTIME_MODEL_LOAD_START_ESTIMATED_REMAINING_MS,
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
        progress: LOCAL_RUNTIME_MODEL_LOAD_START_PROGRESS
          + (progress / 100) * LOCAL_RUNTIME_MODEL_LOAD_PROGRESS_RANGE,
        estimatedRemainingMs: estimateModelLoadRemainingMs(progress),
      });
    });

    reportSuggestProgress(onProgress, {
      stage: 'initializing_multimodal',
      message: '画像解析の準備をしています。',
      progress: LOCAL_RUNTIME_MODEL_LOAD_END_PROGRESS,
      estimatedRemainingMs: LOCAL_RUNTIME_MODEL_LOAD_END_ESTIMATED_REMAINING_MS,
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

    reportSuggestProgress(onProgress, {
      stage: 'initializing_multimodal',
      message: '画像解析の準備が完了しました。',
      progress: LOCAL_RUNTIME_MULTIMODAL_READY_PROGRESS,
      estimatedRemainingMs: LOCAL_RUNTIME_MULTIMODAL_READY_ESTIMATED_REMAINING_MS,
    });

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
        message: 'AI model の準備は完了しています。写真解析の前処理を始めます。',
        progress: LOCAL_RUNTIME_MULTIMODAL_READY_PROGRESS,
        estimatedRemainingMs: LOCAL_RUNTIME_MULTIMODAL_READY_ESTIMATED_REMAINING_MS,
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

  async prewarm(options?: MealInputAssistPrewarmOptions): Promise<void> {
    const context = await this.contextLoader.load(options?.onProgress);
    reportSuggestProgress(options?.onProgress, {
      stage: 'analyzing_photo',
      message: '写真解析の前処理を事前に整えています。',
      progress: LOCAL_RUNTIME_CLEAR_CACHE_START_PROGRESS,
      estimatedRemainingMs: LOCAL_RUNTIME_CLEAR_CACHE_START_ESTIMATED_REMAINING_MS,
    });
    await context.clearCache();
    reportSuggestProgress(options?.onProgress, {
      stage: 'analyzing_photo',
      message: '写真解析の前処理を事前に整えました。',
      progress: LOCAL_RUNTIME_CLEAR_CACHE_DONE_PROGRESS,
      estimatedRemainingMs: LOCAL_RUNTIME_CLEAR_CACHE_DONE_ESTIMATED_REMAINING_MS,
    });
  }

  async suggest(
    request: MealInputAssistRequest,
    options?: MealInputAssistSuggestOptions
  ): Promise<MealInputAssistProviderResult> {
    const context = await this.contextLoader.load(options?.onProgress);
    reportSuggestProgress(options?.onProgress, {
      stage: 'analyzing_photo',
      message: '写真解析の前処理を始めています。',
      progress: LOCAL_RUNTIME_CLEAR_CACHE_START_PROGRESS,
      estimatedRemainingMs: LOCAL_RUNTIME_CLEAR_CACHE_START_ESTIMATED_REMAINING_MS,
    });
    await context.clearCache();

    reportSuggestProgress(options?.onProgress, {
      stage: 'analyzing_photo',
      message: '写真解析の前処理が完了しました。',
      progress: LOCAL_RUNTIME_CLEAR_CACHE_DONE_PROGRESS,
      estimatedRemainingMs: LOCAL_RUNTIME_CLEAR_CACHE_DONE_ESTIMATED_REMAINING_MS,
    });

    reportSuggestProgress(options?.onProgress, {
      stage: 'analyzing_photo',
      message: '写真を解析しています。候補生成を開始しました。',
      progress: LOCAL_RUNTIME_COMPLETION_SUBMITTED_PROGRESS,
      estimatedRemainingMs: LOCAL_RUNTIME_COMPLETION_SUBMITTED_ESTIMATED_REMAINING_MS,
    });

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
        progress: LOCAL_RUNTIME_GENERATION_START_PROGRESS
          + tokenProgress * LOCAL_RUNTIME_GENERATION_PROGRESS_RANGE,
        estimatedRemainingMs: estimateGenerationRemainingMs(tokenProgress),
      });
    });

    reportSuggestProgress(options?.onProgress, {
      stage: 'finalizing',
      message: '候補を整形しています。',
      progress: LOCAL_RUNTIME_FINALIZING_PROGRESS,
      estimatedRemainingMs: LOCAL_RUNTIME_FINALIZING_ESTIMATED_REMAINING_MS,
    });

    const responseText = getCompletionResponseText(completion);
    const parsedResponse = parseMealInputAssistResponse(responseText);

    if (!hasAnyProviderCandidates(parsedResponse)) {
      console.info('Meal input assist model response contained no provider candidates.', {
        candidateCounts: countProviderCandidates(parsedResponse),
        tokensPredicted: completion.tokens_predicted ?? null,
        tokensEvaluated: completion.tokens_evaluated ?? null,
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

export async function getLocalRuntimePrototypeAvailability(): Promise<LocalRuntimePrototypeAvailability> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return createLocalRuntimeUnavailableAvailability(
      'runtime_unavailable',
      getUnsupportedRuntimeReason()
    );
  }

  if (!hasLlamaNativeModule()) {
    return createLocalRuntimeUnavailableAvailability(
      'runtime_unavailable',
      getUnsupportedRuntimeReason()
    );
  }

  if (Platform.OS === 'android' && !hasSupportedAndroidAbi()) {
    return createLocalRuntimeUnavailableAvailability(
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
    return createLocalRuntimeUnavailableAvailability('model_unavailable', modelAvailability.reason);
  }

  if (projectorAvailability.kind === 'unavailable') {
    return createLocalRuntimeUnavailableAvailability('model_unavailable', projectorAvailability.reason);
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
