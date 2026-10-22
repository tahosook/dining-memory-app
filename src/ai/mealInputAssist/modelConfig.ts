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
  version: 'mediapipe-model-v0.1.0',
  fileName: 'meal-input-assist.task',
  url: 'https://github.com/tahosook/dining-memory-app/releases/download/mediapipe-model-v0.1.0/meal-input-assist.task',
  sha256: '3b3916614aae9e8d6ea85358b4b26aba024c54902b9257ae28338c80eadaa601',
} as const;

export interface MediaPipeClassifierModelMeta {
  id: MediaPipeClassifierModelId;
  label: string;
  shortLabel: string;
  description: string;
  version: string;
  fileName: string;
  assetPath: string;
  sha256: string;
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
    version: 'mediapipe-model-v0.1.0',
    fileName: 'meal-input-assist.task',
    assetPath: 'mediapipe/meal-input-assist.task',
    sha256: '3b3916614aae9e8d6ea85358b4b26aba024c54902b9257ae28338c80eadaa601',
  },
  universal_scene_7class: {
    id: 'universal_scene_7class',
    label: '食卓シーン（汎用・7クラス）',
    shortLabel: '食卓シーン',
    description: 'おうち定食・ワンプレート・晩酌バル・麺類単品・外食トレイなどシーンで分類',
    version: 'universal-scene-7class-v1.0.0',
    fileName: 'universal_scene_7class.task',
    assetPath: 'mediapipe/universal_scene_7class.task',
    sha256: '6dae435d14bd3a7db9c1ea14dde61286f51bb36d52400ebdaf28f4a8bcad3fa1',
  },
  personal_household_8class: {
    id: 'personal_household_8class',
    label: 'わたし専用（我が家の食卓・8クラス）',
    shortLabel: 'わたし専用',
    description: '夕定食・北欧大皿合盛り・特製カレー・鮭納豆朝食・染付晩酌膳など我が家の定番で分類',
    version: 'personal-household-8class-v1.0.0',
    fileName: 'personal_household_8class.task',
    assetPath: 'mediapipe/personal_household_8class.task',
    sha256: '924a9782aa374278d8521e74a4a814398fd24cfefd0b6e0f2354235b428de15c',
  },
  universal_dining_23class: {
    id: 'universal_dining_23class',
    label: '汎用（定番料理・23クラス）',
    shortLabel: '定番料理',
    description: '焼き魚・生姜焼き・ハンバーグ・ラーメン・うどん・カレーなど日本の定番料理で分類',
    version: 'universal-dining-23class-v1.0.0',
    fileName: 'universal_dining_23class.task',
    assetPath: 'mediapipe/universal_dining_23class.task',
    sha256: '',
  },
  personal_multilabel_44tag: {
    id: 'personal_multilabel_44tag',
    label: 'わたし専用（食卓3軸マルチラベル）',
    shortLabel: '食卓3軸',
    description: '主菜20種・副菜汁物14種・シーン10種を同時分解し、メモ下書きまで自動生成',
    version: 'personal-multilabel-44tag-v1.0.0',
    fileName: 'personal_multilabel_44tag.task',
    assetPath: 'mediapipe/personal_multilabel_44tag.task',
    sha256: '',
  },
};

export const MEDIAPIPE_CLASSIFIER_MODEL_LIST: MediaPipeClassifierModelMeta[] = [
  MEDIAPIPE_CLASSIFIER_MODELS.cooking_method_9class,
  MEDIAPIPE_CLASSIFIER_MODELS.universal_scene_7class,
  MEDIAPIPE_CLASSIFIER_MODELS.personal_household_8class,
  MEDIAPIPE_CLASSIFIER_MODELS.universal_dining_23class,
  MEDIAPIPE_CLASSIFIER_MODELS.personal_multilabel_44tag,
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

function resolveMealInputAssistFilePath(fileName: string) {
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

export function resolveMediaPipeModelPath(modelId?: MediaPipeClassifierModelId) {
  const fileName = modelId
    ? (MEDIAPIPE_CLASSIFIER_MODELS[modelId]?.fileName ?? MEDIAPIPE_MODEL_CONFIG.fileName)
    : MEDIAPIPE_MODEL_CONFIG.fileName;
  return resolveMealInputAssistFilePath(fileName);
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
