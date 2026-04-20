jest.mock('llama.rn', () => require('llama.rn/jest/mock'));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
}));

import { NativeModules, Platform } from 'react-native';
import { getInfoAsync } from 'expo-file-system/legacy';
import { getLocalAiRuntimeStatusSnapshot } from '../src/ai/runtime';

describe('local AI runtime status snapshot', () => {
  beforeEach(() => {
    jest.restoreAllMocks();

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

  test('returns ready entries when both local runtimes can load required assets', async () => {
    const snapshot = await getLocalAiRuntimeStatusSnapshot();

    expect(snapshot).toEqual({
      semanticSearch: {
        capability: 'semantic-search',
        kind: 'ready',
        mode: 'local-runtime-prototype',
        reason: '端末内 semantic search runtime を利用できます。',
        expectedPaths: ['file:///documents/ai-models/semantic-search.gguf'],
      },
      mealInputAssist: {
        capability: 'meal-input-assist',
        kind: 'ready',
        mode: 'local-runtime-prototype',
        reason: '端末内 AI 入力補助 runtime を利用できます。',
        expectedPaths: [
          'file:///documents/ai-models/meal-input-assist.gguf',
          'file:///documents/ai-models/meal-input-assist.mmproj',
        ],
      },
    });
  });

  test('returns semantic model_unavailable while keeping expected paths', async () => {
    (getInfoAsync as jest.Mock).mockImplementation(async (path: string) => ({
      exists: !path.endsWith('semantic-search.gguf'),
    }));

    const snapshot = await getLocalAiRuntimeStatusSnapshot();

    expect(snapshot.semanticSearch).toEqual({
      capability: 'semantic-search',
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'model_unavailable',
      reason: 'semantic search model が見つかりません: file:///documents/ai-models/semantic-search.gguf',
      expectedPaths: ['file:///documents/ai-models/semantic-search.gguf'],
    });
    expect(snapshot.mealInputAssist.expectedPaths).toEqual([
      'file:///documents/ai-models/meal-input-assist.gguf',
      'file:///documents/ai-models/meal-input-assist.mmproj',
    ]);
  });

  test('returns meal input assist model_unavailable when the projector file is missing', async () => {
    (getInfoAsync as jest.Mock).mockImplementation(async (path: string) => ({
      exists: !path.endsWith('meal-input-assist.mmproj'),
    }));

    const snapshot = await getLocalAiRuntimeStatusSnapshot();

    expect(snapshot.mealInputAssist).toEqual({
      capability: 'meal-input-assist',
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'model_unavailable',
      reason: 'meal input assist projector が見つかりません: file:///documents/ai-models/meal-input-assist.mmproj',
      expectedPaths: [
        'file:///documents/ai-models/meal-input-assist.gguf',
        'file:///documents/ai-models/meal-input-assist.mmproj',
      ],
    });
  });

  test('returns runtime_unavailable for both entries when the native module is not linked', async () => {
    NativeModules.RNLlama = undefined;

    const snapshot = await getLocalAiRuntimeStatusSnapshot();

    expect(snapshot.semanticSearch).toEqual({
      capability: 'semantic-search',
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'runtime_unavailable',
      reason: 'この build には端末内 AI runtime がまだ組み込まれていません。',
      expectedPaths: ['file:///documents/ai-models/semantic-search.gguf'],
    });
    expect(snapshot.mealInputAssist).toEqual({
      capability: 'meal-input-assist',
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'runtime_unavailable',
      reason: 'この build には端末内 AI runtime がまだ組み込まれていません。',
      expectedPaths: [
        'file:///documents/ai-models/meal-input-assist.gguf',
        'file:///documents/ai-models/meal-input-assist.mmproj',
      ],
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

    const snapshot = await getLocalAiRuntimeStatusSnapshot();

    expect(snapshot.semanticSearch.code).toBe('unsupported_architecture');
    expect(snapshot.mealInputAssist.code).toBe('unsupported_architecture');
  });
});
