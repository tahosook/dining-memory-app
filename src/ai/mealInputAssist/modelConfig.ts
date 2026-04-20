import { documentDirectory } from 'expo-file-system/legacy';

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

const LOCAL_MODEL_DIRECTORY = 'ai-models';
const MANAGED_FILE_ORDER = ['model', 'projector'] as const;
const MANAGED_FILE_LABELS = {
  model: 'Model',
  projector: 'Projector',
} as const;

export type MealInputAssistManagedFileKey = typeof MANAGED_FILE_ORDER[number];

export interface MealInputAssistManagedFile {
  key: MealInputAssistManagedFileKey;
  label: typeof MANAGED_FILE_LABELS[MealInputAssistManagedFileKey];
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

export function getMealInputAssistExpectedPaths() {
  return [
    resolveMealInputAssistModelPath(),
    resolveMealInputAssistProjectorPath(),
  ].filter((path): path is string => Boolean(path));
}

export function getMealInputAssistManagedFiles(): MealInputAssistManagedFile[] {
  return MANAGED_FILE_ORDER.map((key) => {
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
