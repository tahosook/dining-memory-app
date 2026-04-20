export type AiCapability = 'meal-input-assist' | 'text-embedding' | 'text-rerank';

export type AiRuntimeMode = 'local-runtime-prototype' | 'override';

export type AiRuntimeUnavailableCode = 'runtime_unavailable' | 'model_unavailable' | 'unsupported_architecture';

export interface AiReadyCapabilityAvailability<TProvider> {
  kind: 'ready';
  capability: AiCapability;
  mode: AiRuntimeMode;
  description: string;
  provider: TProvider;
}

export interface AiUnavailableCapabilityAvailability {
  kind: 'unavailable';
  capability: AiCapability;
  mode: 'local-runtime-prototype';
  code: AiRuntimeUnavailableCode;
  reason: string;
}

export type AiCapabilityAvailability<TProvider> =
  | AiReadyCapabilityAvailability<TProvider>
  | AiUnavailableCapabilityAvailability;

export interface AiTextEmbeddingResult {
  vector: number[];
  modelId: string;
  dimension: number;
}

export interface AiTextEmbeddingProvider {
  modelId: string;
  generateEmbedding: (text: string) => Promise<AiTextEmbeddingResult>;
}

export interface AiTextRerankResult {
  index: number;
  score: number;
  document?: string;
}

export interface AiTextRerankProvider {
  modelId: string;
  rerank: (query: string, documents: string[]) => Promise<AiTextRerankResult[]>;
}
