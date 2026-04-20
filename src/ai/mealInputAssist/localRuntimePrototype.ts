import { documentDirectory, getInfoAsync } from 'expo-file-system/legacy';
import { initLlama, type LlamaContext } from 'llama.rn';
import { NativeModules, Platform } from 'react-native';
import { CUISINE_TYPE_OPTIONS } from '../../constants/MealOptions';
import { createUnavailableRuntimeAvailability } from './runtimeAvailability';
import type { MealInputAssistProvider, MealInputAssistProviderResult, MealInputAssistRequest, MealInputAssistRuntimeAvailability } from './types';

const LOCAL_MODEL_DIRECTORY = 'ai-models';
const MEAL_INPUT_ASSIST_MODEL_FILENAME = 'meal-input-assist.gguf';
const MEAL_INPUT_ASSIST_PROJECTOR_FILENAME = 'meal-input-assist.mmproj';
const LOCAL_MEAL_INPUT_ASSIST_SOURCE = 'local-meal-input-assist';
const SUPPORTED_ANDROID_ABIS = new Set(['arm64-v8a', 'x86_64']);

type PlatformConstantsWithSupportedAbis = {
  SupportedAbis?: string[];
  supportedAbis?: string[];
};

const MEAL_INPUT_ASSIST_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mealNames: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              value: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['value'],
          },
        },
        cuisineTypes: {
          type: 'array',
          maxItems: 2,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              value: { type: 'string', enum: [...CUISINE_TYPE_OPTIONS] },
              confidence: { type: 'number' },
            },
            required: ['value'],
          },
        },
        homemade: {
          type: 'array',
          maxItems: 2,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              value: { type: 'string', enum: ['自炊', '外食'] },
              confidence: { type: 'number' },
            },
            required: ['value'],
          },
        },
      },
    },
  },
};

function stripFileScheme(path: string) {
  return path.startsWith('file://') ? path.slice(7) : path;
}

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

function buildMealInputAssistPrompt(request: MealInputAssistRequest) {
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
    '不明な項目は空配列にしてください。',
    `料理ジャンルは ${CUISINE_TYPE_OPTIONS.join(' / ')} のみを使ってください。`,
    '自炊判定は 自炊 または 外食 のみを使ってください。',
    '候補は短く自然な日本語にしてください。',
    '現在の入力:',
    `- 料理名: ${currentMealName}`,
    `- 料理ジャンル: ${currentCuisineType}`,
    `- 場所: ${currentLocationName}`,
    `- メモ: ${currentNotes}`,
    `- 自炊判定: ${currentHomemade}`,
  ].join('\n');
}

function extractJsonText(text: string) {
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

function parseMealInputAssistResponse(text: string): MealInputAssistProviderResult {
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

class LlamaMultimodalContextLoader {
  private contextPromise: Promise<LlamaContext> | null = null;

  constructor(
    private readonly modelPath: string,
    private readonly projectorPath: string
  ) {}

  private async createContext() {
    const context = await initLlama({
      model: this.modelPath,
      n_ctx: 2048,
      n_batch: 512,
      use_mmap: true,
    });

    const initialized = await context.initMultimodal({
      path: this.projectorPath,
      image_max_tokens: 384,
    });
    if (!initialized) {
      throw new Error('Multimodal projector could not be initialized.');
    }

    const support = await context.getMultimodalSupport();
    if (!support.vision) {
      throw new Error('Vision input is not supported by the configured multimodal runtime.');
    }

    return context;
  }

  async load() {
    if (!this.contextPromise) {
      this.contextPromise = this.createContext();
    }

    return this.contextPromise;
  }
}

export function resolveMealInputAssistModelPath() {
  if (!documentDirectory) {
    return null;
  }

  return `${documentDirectory}${LOCAL_MODEL_DIRECTORY}/${MEAL_INPUT_ASSIST_MODEL_FILENAME}`;
}

export function resolveMealInputAssistProjectorPath() {
  if (!documentDirectory) {
    return null;
  }

  return `${documentDirectory}${LOCAL_MODEL_DIRECTORY}/${MEAL_INPUT_ASSIST_PROJECTOR_FILENAME}`;
}

export class LocalRuntimePrototypeMealInputAssistProvider implements MealInputAssistProvider {
  private readonly contextLoader: LlamaMultimodalContextLoader;

  constructor(modelPath: string, projectorPath: string) {
    this.contextLoader = new LlamaMultimodalContextLoader(modelPath, projectorPath);
  }

  async suggest(request: MealInputAssistRequest): Promise<MealInputAssistProviderResult> {
    const context = await this.contextLoader.load();
    await context.clearCache();

    const completion = await context.completion({
      prompt: buildMealInputAssistPrompt(request),
      media_paths: [stripFileScheme(request.photoUri)],
      response_format: MEAL_INPUT_ASSIST_RESPONSE_FORMAT,
      temperature: 0.2,
      n_predict: 192,
    });

    return parseMealInputAssistResponse(completion.text || completion.content);
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
