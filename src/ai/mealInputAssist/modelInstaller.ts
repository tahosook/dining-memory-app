import { readDirectoryAsync } from 'expo-file-system/legacy';
import { AppSettingsService } from '../../database/services/AppSettingsService';
import { resolveMealInputAssistModelDirectoryPath } from './modelConfig';
import { cleanupFile } from './installer/fileOperations';
import { persistAllLocalAiModelsNotInstalledState } from './installer/modelStateStore';

export {
  deleteMealInputAssistModel,
  getMealInputAssistModelStatus,
  installMealInputAssistModel,
  redownloadMealInputAssistModel,
} from './installer/ggufModelInstaller';
export {
  cleanupOrphanedDualMediaPipeModel,
  cleanupRetiredMediaPipeModels,
  deleteMediaPipeModel,
  deleteMediaPipeModelForModel,
  getMediaPipeModelStatus,
  getMediaPipeModelStatusForModel,
  installMediaPipeModel,
  installMediaPipeModelForModel,
  redownloadMediaPipeModel,
  redownloadMediaPipeModelForModel,
} from './installer/mediapipeModelInstaller';

/**
 * Deletes every downloaded local AI model binary under `ai-models` and resets all persisted
 * GGUF, legacy MediaPipe, and per-model MediaPipe states to `not_installed`.
 */
export async function deleteAllDownloadedLocalAiModels(): Promise<void> {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();

  if (directoryPath) {
    const entries = await readDirectoryAsync(directoryPath).catch(() => []);
    await Promise.all(entries.map(entry => cleanupFile(`${directoryPath}/${entry}`)));
  }

  await persistAllLocalAiModelsNotInstalledState();
  await AppSettingsService.cleanupLegacyMediaPipeModelSettings().catch(() => {});
}
