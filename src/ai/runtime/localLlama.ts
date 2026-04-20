import { getInfoAsync, documentDirectory } from 'expo-file-system/legacy';
import { NativeModules, Platform } from 'react-native';
import { initLlama, type ContextParams, type LlamaContext } from 'llama.rn';
import {
  createReadyAiCapabilityAvailability,
  createUnavailableAiCapabilityAvailability,
  createUnsupportedArchitectureAiCapabilityAvailability,
} from './availability';
import type {
  AiCapabilityAvailability,
  AiTextEmbeddingProvider,
  AiTextEmbeddingResult,
  AiTextRerankProvider,
  AiTextRerankResult,
} from './types';

const LOCAL_LLAMA_MODEL_ID = 'local-semantic-search';
const LOCAL_MODEL_DIRECTORY = 'ai-models';
const SEMANTIC_SEARCH_MODEL_FILENAME = 'semantic-search.gguf';
const SUPPORTED_ANDROID_ABIS = new Set(['arm64-v8a', 'x86_64']);

type PlatformConstantsWithSupportedAbis = {
  SupportedAbis?: string[];
  supportedAbis?: string[];
};

class LlamaContextLoader {
  private contextPromise: Promise<LlamaContext> | null = null;

  constructor(private readonly params: ContextParams) {}

  async load() {
    if (!this.contextPromise) {
      this.contextPromise = initLlama(this.params);
    }

    return this.contextPromise;
  }
}

class LocalLlamaTextEmbeddingProvider implements AiTextEmbeddingProvider {
  readonly modelId = LOCAL_LLAMA_MODEL_ID;
  private readonly contextLoader: LlamaContextLoader;

  constructor(modelPath: string) {
    this.contextLoader = new LlamaContextLoader({
      model: modelPath,
      embedding: true,
      n_ctx: 1024,
      n_batch: 512,
      use_mmap: true,
    });
  }

  async generateEmbedding(text: string): Promise<AiTextEmbeddingResult> {
    const context = await this.contextLoader.load();
    const result = await context.embedding(text);

    return {
      vector: result.embedding,
      modelId: this.modelId,
      dimension: context.model.nEmbd,
    };
  }
}

class LocalLlamaTextRerankProvider implements AiTextRerankProvider {
  readonly modelId = LOCAL_LLAMA_MODEL_ID;
  private readonly contextLoader: LlamaContextLoader;

  constructor(modelPath: string) {
    this.contextLoader = new LlamaContextLoader({
      model: modelPath,
      embedding: true,
      pooling_type: 'rank',
      n_ctx: 1024,
      n_batch: 512,
      use_mmap: true,
    });
  }

  async rerank(query: string, documents: string[]): Promise<AiTextRerankResult[]> {
    const context = await this.contextLoader.load();
    return context.rerank(query, documents, { normalize: 1 });
  }
}

function getSupportedAndroidAbis() {
  const constants = NativeModules.PlatformConstants as PlatformConstantsWithSupportedAbis | undefined;
  return constants?.SupportedAbis ?? constants?.supportedAbis ?? [];
}

function getUnsupportedRuntimeReason() {
  if (Platform.OS === 'web') {
    return 'Web build では端末内 AI runtime を利用できません。';
  }

  return 'この build には端末内 AI runtime がまだ組み込まれていません。';
}

function hasSupportedAndroidAbi() {
  const supportedAbis = getSupportedAndroidAbis();
  if (!supportedAbis.length) {
    return true;
  }

  return supportedAbis.some((abi) => SUPPORTED_ANDROID_ABIS.has(abi));
}

async function getLocalModelAvailability() {
  const modelPath = resolveSemanticSearchModelPath();
  if (!modelPath) {
    return {
      kind: 'unavailable' as const,
      reason: 'semantic search model path を解決できませんでした。',
    };
  }

  const info = await getInfoAsync(modelPath);
  if (!info.exists) {
    return {
      kind: 'unavailable' as const,
      reason: `semantic search model が見つかりません: ${modelPath}`,
    };
  }

  return {
    kind: 'ready' as const,
    modelPath,
  };
}

function hasLlamaNativeModule() {
  return typeof NativeModules.RNLlama?.install === 'function';
}

export function resolveSemanticSearchModelPath() {
  if (!documentDirectory) {
    return null;
  }

  return `${documentDirectory}${LOCAL_MODEL_DIRECTORY}/${SEMANTIC_SEARCH_MODEL_FILENAME}`;
}

export async function getLocalLlamaTextEmbeddingAvailability(): Promise<AiCapabilityAvailability<AiTextEmbeddingProvider>> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return createUnavailableAiCapabilityAvailability(
      'text-embedding',
      'runtime_unavailable',
      getUnsupportedRuntimeReason()
    );
  }

  if (!hasLlamaNativeModule()) {
    return createUnavailableAiCapabilityAvailability(
      'text-embedding',
      'runtime_unavailable',
      getUnsupportedRuntimeReason()
    );
  }

  if (Platform.OS === 'android' && !hasSupportedAndroidAbi()) {
    return createUnsupportedArchitectureAiCapabilityAvailability(
      'text-embedding',
      'この Android ABI では端末内 semantic runtime を利用できません。'
    );
  }

  const modelAvailability = await getLocalModelAvailability();
  if (modelAvailability.kind === 'unavailable') {
    return createUnavailableAiCapabilityAvailability(
      'text-embedding',
      'model_unavailable',
      modelAvailability.reason
    );
  }

  return createReadyAiCapabilityAvailability({
    capability: 'text-embedding',
    mode: 'local-runtime-prototype',
    description: 'Local llama.rn text embedding provider',
    provider: new LocalLlamaTextEmbeddingProvider(modelAvailability.modelPath),
  });
}

export async function getLocalLlamaTextRerankAvailability(): Promise<AiCapabilityAvailability<AiTextRerankProvider>> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return createUnavailableAiCapabilityAvailability(
      'text-rerank',
      'runtime_unavailable',
      getUnsupportedRuntimeReason()
    );
  }

  if (!hasLlamaNativeModule()) {
    return createUnavailableAiCapabilityAvailability(
      'text-rerank',
      'runtime_unavailable',
      getUnsupportedRuntimeReason()
    );
  }

  if (Platform.OS === 'android' && !hasSupportedAndroidAbi()) {
    return createUnsupportedArchitectureAiCapabilityAvailability(
      'text-rerank',
      'この Android ABI では端末内 semantic runtime を利用できません。'
    );
  }

  const modelAvailability = await getLocalModelAvailability();
  if (modelAvailability.kind === 'unavailable') {
    return createUnavailableAiCapabilityAvailability(
      'text-rerank',
      'model_unavailable',
      modelAvailability.reason
    );
  }

  return createReadyAiCapabilityAvailability({
    capability: 'text-rerank',
    mode: 'local-runtime-prototype',
    description: 'Local llama.rn text rerank provider',
    provider: new LocalLlamaTextRerankProvider(modelAvailability.modelPath),
  });
}
