jest.mock('llama.rn', () => require('llama.rn/jest/mock'));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
}));

import { NativeModules, Platform } from 'react-native';
import { getInfoAsync } from 'expo-file-system/legacy';
import {
  getLocalLlamaTextEmbeddingAvailability,
  getLocalLlamaTextRerankAvailability,
  resolveSemanticSearchModelPath,
} from '../src/ai/runtime';

describe('local llama runtime availability', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });

    NativeModules.RNLlama = {
      install: jest.fn().mockResolvedValue(true),
    };
    NativeModules.PlatformConstants = {};

    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
  });

  test('resolves the fixed app-local semantic search model path', () => {
    expect(resolveSemanticSearchModelPath()).toBe('file:///documents/ai-models/semantic-search.gguf');
  });

  test('returns a ready embedding provider when the native module and model are available', async () => {
    const availability = await getLocalLlamaTextEmbeddingAvailability();

    expect(availability.kind).toBe('ready');
    expect(availability).toEqual(
      expect.objectContaining({
        kind: 'ready',
        capability: 'text-embedding',
        mode: 'local-runtime-prototype',
      })
    );

    if (availability.kind !== 'ready') {
      throw new Error('Expected a ready embedding provider.');
    }

    const result = await availability.provider.generateEmbedding('海鮮丼');

    expect(result.modelId).toBe('local-semantic-search');
    expect(result.dimension).toBe(768);
    expect(result.vector).toHaveLength(768);
  });

  test('returns a ready rerank provider when the native module and model are available', async () => {
    const availability = await getLocalLlamaTextRerankAvailability();

    expect(availability.kind).toBe('ready');

    if (availability.kind !== 'ready') {
      throw new Error('Expected a ready rerank provider.');
    }

    const results = await availability.provider.rerank('丼もの', ['海鮮丼', 'ラーメン', 'パスタ']);

    expect(results[0]).toEqual({
      index: 0,
      score: 0.9,
      document: '海鮮丼',
    });
  });

  test('returns model_unavailable when the semantic-search model file is missing', async () => {
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

    await expect(getLocalLlamaTextEmbeddingAvailability()).resolves.toEqual({
      kind: 'unavailable',
      capability: 'text-embedding',
      mode: 'local-runtime-prototype',
      code: 'model_unavailable',
      reason: 'semantic search model が見つかりません: file:///documents/ai-models/semantic-search.gguf',
    });
  });

  test('returns runtime_unavailable when the native module is not linked', async () => {
    NativeModules.RNLlama = undefined;

    await expect(getLocalLlamaTextEmbeddingAvailability()).resolves.toEqual({
      kind: 'unavailable',
      capability: 'text-embedding',
      mode: 'local-runtime-prototype',
      code: 'runtime_unavailable',
      reason: 'この build には端末内 AI runtime がまだ組み込まれていません。',
    });
  });

  test('returns unsupported_architecture on Android when only unsupported ABIs are exposed', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    NativeModules.PlatformConstants = {
      SupportedAbis: ['armeabi-v7a'],
    };

    await expect(getLocalLlamaTextEmbeddingAvailability()).resolves.toEqual({
      kind: 'unavailable',
      capability: 'text-embedding',
      mode: 'local-runtime-prototype',
      code: 'unsupported_architecture',
      reason: 'この Android ABI では端末内 semantic runtime を利用できません。',
    });
  });
});
