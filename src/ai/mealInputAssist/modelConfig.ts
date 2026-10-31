import { documentDirectory } from 'expo-file-system/legacy';
import type { MediaPipeClassifierModelId } from './types';

export const MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME = 'Qwen2.5-VL-3B-Instruct';

export const MEAL_INPUT_ASSIST_MODEL_CONFIG = {
  version: 'qwen2.5-vl-3b-instruct-q4km-2026-04-20',
  files: {
    model: {
      fileName: 'meal-input-assist.gguf',
      sourceFileName: 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
      url: 'https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
    },
    projector: {
      fileName: 'meal-input-assist.mmproj',
      sourceFileName: 'mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf',
      url: 'https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf',
    },
  },
} as const;

export const MEDIAPIPE_MODEL_DISPLAY_NAME = 'MediaPipe Meal Classifier';

export const MEDIAPIPE_MODEL_CONFIG = {
  version: 'mediapipe-model-v0.2.0',
  fileName: 'meal-input-assist.task',
  url: 'https://github.com/tahosook/dining-memory-app/releases/download/mediapipe-model-v0.2.0/meal-input-assist.task',
  sha256: '3b3916614aae9e8d6ea85358b4b26aba024c54902b9257ae28338c80eadaa601',
} as const;

export interface MediaPipeClassifierModelFileMeta {
  fileName: string;
  assetPath: string;
  sha256: string;
  url: string;
}

export interface MediaPipeClassifierModelMeta {
  id: MediaPipeClassifierModelId;
  label: string;
  shortLabel: string;
  description: string;
  version: string;
  fileName: string;
  assetPath: string;
  sha256: string;
  url: string;
  available: boolean;
  isDual?: boolean;
  files?: {
    personal_main_dish: MediaPipeClassifierModelFileMeta;
    personal_side_dish: MediaPipeClassifierModelFileMeta;
  };
}

export const DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID: MediaPipeClassifierModelId =
  'cooking_method_9class';

export const MEDIAPIPE_CLASSIFIER_MODELS: Record<
  MediaPipeClassifierModelId,
  MediaPipeClassifierModelMeta
> = {
  cooking_method_9class: {
    id: 'cooking_method_9class',
    label: '標準（調理法・9クラス）',
    shortLabel: '調理法',
    description: 'カレー・麺類・魚料理・肉料理・揚げ物・煮物・炒め物など調理法で分類',
    version: 'mediapipe-model-v0.2.0',
    fileName: 'meal-input-assist.task',
    assetPath: 'mediapipe/meal-input-assist.task',
    sha256: '3b3916614aae9e8d6ea85358b4b26aba024c54902b9257ae28338c80eadaa601',
    url: 'https://github.com/tahosook/dining-memory-app/releases/download/mediapipe-model-v0.2.0/meal-input-assist.task',
    available: true,
  },
  universal_dining_23class: {
    id: 'universal_dining_23class',
    label: '汎用（定番料理・23クラス）',
    shortLabel: '定番料理',
    description:
      '焼き魚・生姜焼き・ハンバーグ・ラーメン・うどん・カレーなど日本の定番料理で分類（高精度Lite2版）',
    version: 'mediapipe-model-v0.2.0',
    fileName: 'universal_dining_23class.task',
    assetPath: 'mediapipe/universal_dining_23class.task',
    sha256: '37fb1f5a8580ef53cdcd813495c9fccee383145076ded003abed5373a0092df2',
    url: 'https://github.com/tahosook/dining-memory-app/releases/download/mediapipe-model-v0.2.0/universal_dining_23class.task',
    available: true,
  },
  personal_dual_dish: {
    id: 'personal_dual_dish',
    label: 'わたし専用（主菜＋副菜ペア）',
    shortLabel: '主菜・副菜',
    description:
      '主菜（16種）と副菜（14種）を高精度に分離推論し、シーン導出とメモ下書きまで自動生成',
    version: 'mediapipe-model-v0.2.0',
    fileName: 'personal_main_dish.task',
    assetPath: 'mediapipe/personal_main_dish.task',
    sha256: '2559d4cf62558ac7e736ea7c261382038eec5b0547bed7911c9b92ea4ee11bf9',
    url: 'https://github.com/tahosook/dining-memory-app/releases/download/mediapipe-model-v0.2.0/personal_main_dish.task',
    available: true,
    isDual: true,
    files: {
      personal_main_dish: {
        fileName: 'personal_main_dish.task',
        assetPath: 'mediapipe/personal_main_dish.task',
        sha256: '2559d4cf62558ac7e736ea7c261382038eec5b0547bed7911c9b92ea4ee11bf9',
        url: 'https://github.com/tahosook/dining-memory-app/releases/download/mediapipe-model-v0.2.0/personal_main_dish.task',
      },
      personal_side_dish: {
        fileName: 'personal_side_dish.task',
        assetPath: 'mediapipe/personal_side_dish.task',
        sha256: '703b45489b434634b48a5b2358f880876c4db791a90258e5781c977a8d34967b',
        url: 'https://github.com/tahosook/dining-memory-app/releases/download/mediapipe-model-v0.2.0/personal_side_dish.task',
      },
    },
  },
};

export const MEDIAPIPE_CLASSIFIER_MODEL_LIST: MediaPipeClassifierModelMeta[] = [
  MEDIAPIPE_CLASSIFIER_MODELS.cooking_method_9class,
  MEDIAPIPE_CLASSIFIER_MODELS.universal_dining_23class,
  MEDIAPIPE_CLASSIFIER_MODELS.personal_dual_dish,
];

const LOCAL_MODEL_DIRECTORY = 'ai-models';
const MANAGED_FILE_ORDER = ['model', 'projector'] as const;
const MANAGED_FILE_LABELS = {
  model: 'Model',
  projector: 'Projector',
} as const;

export type MealInputAssistManagedFileKey = (typeof MANAGED_FILE_ORDER)[number];

export interface MealInputAssistManagedFile {
  key: MealInputAssistManagedFileKey;
  label: (typeof MANAGED_FILE_LABELS)[MealInputAssistManagedFileKey];
  fileName: string;
  sourceFileName: string;
  url: string;
  localPath: string | null;
}

export function resolveMealInputAssistFilePath(fileName: string) {
  if (!documentDirectory) {
    return null;
  }

  return `${documentDirectory}${LOCAL_MODEL_DIRECTORY}/${fileName}`;
}

export function resolveMealInputAssistModelDirectoryPath() {
  if (!documentDirectory) {
    return null;
  }

  return `${documentDirectory}${LOCAL_MODEL_DIRECTORY}`;
}

export function resolveMealInputAssistModelPath() {
  return resolveMealInputAssistFilePath(MEAL_INPUT_ASSIST_MODEL_CONFIG.files.model.fileName);
}

export function resolveMealInputAssistProjectorPath() {
  return resolveMealInputAssistFilePath(MEAL_INPUT_ASSIST_MODEL_CONFIG.files.projector.fileName);
}

export function resolveMediaPipeModelPaths(modelId?: MediaPipeClassifierModelId): string[] {
  const resolvedId = modelId ?? DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID;
  const meta = MEDIAPIPE_CLASSIFIER_MODELS[resolvedId];
  if (meta?.isDual && meta.files) {
    return [
      resolveMealInputAssistFilePath(meta.files.personal_main_dish.fileName),
      resolveMealInputAssistFilePath(meta.files.personal_side_dish.fileName),
    ].filter((p): p is string => Boolean(p));
  }
  const fileName = meta?.fileName ?? MEDIAPIPE_MODEL_CONFIG.fileName;
  const path = resolveMealInputAssistFilePath(fileName);
  return path ? [path] : [];
}

export function resolveMediaPipeModelPath(modelId?: MediaPipeClassifierModelId) {
  const paths = resolveMediaPipeModelPaths(modelId);
  return paths[0] ?? null;
}

export function getMealInputAssistExpectedPaths() {
  return [resolveMealInputAssistModelPath(), resolveMealInputAssistProjectorPath()].filter(
    (path): path is string => Boolean(path)
  );
}

export function getMealInputAssistManagedFiles(): MealInputAssistManagedFile[] {
  return MANAGED_FILE_ORDER.map(key => {
    const file = MEAL_INPUT_ASSIST_MODEL_CONFIG.files[key];

    return {
      key,
      label: MANAGED_FILE_LABELS[key],
      fileName: file.fileName,
      sourceFileName: file.sourceFileName,
      url: file.url,
      localPath: resolveMealInputAssistFilePath(file.fileName),
    };
  });
}
