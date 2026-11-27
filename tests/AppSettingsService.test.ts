import { getMealInputAssistEnvironmentRevision } from '../src/ai/mealInputAssist/environment';
import { AppSettingsService } from '../src/database/services/AppSettingsService';

jest.mock('../src/database/services/localDatabase', () => {
  let appSettings: Record<string, string> = {};

  return {
    initializeDatabase: jest.fn(async () => {}),
    getDatabase: jest.fn(() => null),
    isUsingNativeDatabase: jest.fn(() => false),
    getInMemoryAppSettings: jest.fn(() => ({ ...appSettings })),
    setInMemoryAppSettings: jest.fn((nextAppSettings: Record<string, string>) => {
      appSettings = { ...nextAppSettings };
    }),
  };
});

describe('AppSettingsService', () => {
  beforeEach(async () => {
    await AppSettingsService.setAiInputAssistEnabled(false);
  });

  test('defaults AI input assist to off', async () => {
    await expect(AppSettingsService.getAiInputAssistEnabled()).resolves.toBe(false);
  });

  test('persists AI input assist flag in the in-memory fallback', async () => {
    await AppSettingsService.setAiInputAssistEnabled(true);

    await expect(AppSettingsService.getAiInputAssistEnabled()).resolves.toBe(true);
  });

  test('can overwrite an existing AI input assist flag', async () => {
    await AppSettingsService.setAiInputAssistEnabled(true);
    await AppSettingsService.setAiInputAssistEnabled(false);

    await expect(AppSettingsService.getAiInputAssistEnabled()).resolves.toBe(false);
  });

  test('persists meal input assist model settings in the in-memory fallback', async () => {
    await AppSettingsService.setMealInputAssistModelVersion('v-test');
    await AppSettingsService.setMealInputAssistModelStatus('ready');
    await AppSettingsService.setMealInputAssistModelDownloadedAt(12345);
    await AppSettingsService.setMealInputAssistModelErrorMessage('none');

    await expect(AppSettingsService.getMealInputAssistModelVersion()).resolves.toBe('v-test');
    await expect(AppSettingsService.getMealInputAssistModelStatus()).resolves.toBe('ready');
    await expect(AppSettingsService.getMealInputAssistModelDownloadedAt()).resolves.toBe(12345);
    await expect(AppSettingsService.getMealInputAssistModelErrorMessage()).resolves.toBe('none');
  });

  test('clears nullable meal input assist model settings', async () => {
    await AppSettingsService.setMealInputAssistModelVersion('v-test');
    await AppSettingsService.setMealInputAssistModelDownloadedAt(12345);
    await AppSettingsService.setMealInputAssistModelErrorMessage('failed');

    await AppSettingsService.setMealInputAssistModelVersion(null);
    await AppSettingsService.setMealInputAssistModelDownloadedAt(null);
    await AppSettingsService.setMealInputAssistModelErrorMessage(null);

    await expect(AppSettingsService.getMealInputAssistModelVersion()).resolves.toBeNull();
    await expect(AppSettingsService.getMealInputAssistModelDownloadedAt()).resolves.toBeNull();
    await expect(AppSettingsService.getMealInputAssistModelErrorMessage()).resolves.toBeNull();
  });

  test('defaults MediaPipe model settings to initial state', async () => {
    await expect(AppSettingsService.getMediaPipeModelStatus()).resolves.toBe('not_installed');
    await expect(AppSettingsService.getMediaPipeModelVersion()).resolves.toBeNull();
    await expect(AppSettingsService.getMediaPipeModelDownloadedAt()).resolves.toBeNull();
    await expect(AppSettingsService.getMediaPipeModelErrorMessage()).resolves.toBeNull();
  });

  test('persists MediaPipe model settings in the in-memory fallback', async () => {
    await AppSettingsService.setMediaPipeModelStatus('ready');
    await AppSettingsService.setMediaPipeModelVersion('mediapipe-v0.1.0');
    await AppSettingsService.setMediaPipeModelDownloadedAt(12345);
    await AppSettingsService.setMediaPipeModelErrorMessage('none');

    await expect(AppSettingsService.getMediaPipeModelStatus()).resolves.toBe('ready');
    await expect(AppSettingsService.getMediaPipeModelVersion()).resolves.toBe('mediapipe-v0.1.0');
    await expect(AppSettingsService.getMediaPipeModelDownloadedAt()).resolves.toBe(12345);
    await expect(AppSettingsService.getMediaPipeModelErrorMessage()).resolves.toBe('none');
  });

  test('clears nullable MediaPipe model settings', async () => {
    await AppSettingsService.setMediaPipeModelVersion('mediapipe-v0.1.0');
    await AppSettingsService.setMediaPipeModelDownloadedAt(12345);
    await AppSettingsService.setMediaPipeModelErrorMessage('failed');

    await AppSettingsService.setMediaPipeModelVersion(null);
    await AppSettingsService.setMediaPipeModelDownloadedAt(null);
    await AppSettingsService.setMediaPipeModelErrorMessage(null);

    await expect(AppSettingsService.getMediaPipeModelVersion()).resolves.toBeNull();
    await expect(AppSettingsService.getMediaPipeModelDownloadedAt()).resolves.toBeNull();
    await expect(AppSettingsService.getMediaPipeModelErrorMessage()).resolves.toBeNull();
  });

  test('updates MediaPipe model status and error message', async () => {
    await AppSettingsService.setMediaPipeModelStatus('error');
    await AppSettingsService.setMediaPipeModelErrorMessage('download_failed');

    await expect(AppSettingsService.getMediaPipeModelStatus()).resolves.toBe('error');
    await expect(AppSettingsService.getMediaPipeModelErrorMessage()).resolves.toBe(
      'download_failed'
    );
  });

  test('falls back to not_installed for invalid MediaPipe status', async () => {
    await AppSettingsService.setString('mediapipe_model_status', 'invalid_status');
    await expect(AppSettingsService.getMediaPipeModelStatus()).resolves.toBe('not_installed');
  });

  test('keeps GGUF and MediaPipe model settings isolated', async () => {
    await AppSettingsService.setMealInputAssistModelStatus('ready');
    await AppSettingsService.setMealInputAssistModelVersion('gguf-v1');
    await AppSettingsService.setMediaPipeModelStatus('not_installed');
    await AppSettingsService.setMediaPipeModelVersion('mediapipe-v1');

    await expect(AppSettingsService.getMealInputAssistModelStatus()).resolves.toBe('ready');
    await expect(AppSettingsService.getMealInputAssistModelVersion()).resolves.toBe('gguf-v1');
    await expect(AppSettingsService.getMediaPipeModelStatus()).resolves.toBe('not_installed');
    await expect(AppSettingsService.getMediaPipeModelVersion()).resolves.toBe('mediapipe-v1');
  });

  test('defaults MediaPipe classifier model ID to cooking_method_9class', async () => {
    // Clear any prior set value by setting a non-existent or reset key
    await AppSettingsService.setString('mediapipe_classifier_model_id', '');
    await expect(AppSettingsService.getMediaPipeClassifierModelId()).resolves.toBe(
      'cooking_method_9class'
    );
  });

  test('persists and retrieves valid MediaPipe classifier model IDs', async () => {
    await AppSettingsService.setMediaPipeClassifierModelId('universal_dining_23class');
    await expect(AppSettingsService.getMediaPipeClassifierModelId()).resolves.toBe(
      'universal_dining_23class'
    );

    await AppSettingsService.setMediaPipeClassifierModelId('personal_dual_dish');
    await expect(AppSettingsService.getMediaPipeClassifierModelId()).resolves.toBe(
      'personal_dual_dish'
    );

    await AppSettingsService.setMediaPipeClassifierModelId('cooking_method_9class');
    await expect(AppSettingsService.getMediaPipeClassifierModelId()).resolves.toBe(
      'cooking_method_9class'
    );
  });

  test('resolves legacy model IDs to direct successors without mutating persisted settings', async () => {
    const initialRevision = getMealInputAssistEnvironmentRevision();
    await AppSettingsService.setString('mediapipe_classifier_model_id', 'universal_scene_7class');
    await expect(AppSettingsService.getMediaPipeClassifierModelId()).resolves.toBe(
      'universal_dining_23class'
    );
    await expect(AppSettingsService.getString('mediapipe_classifier_model_id', null)).resolves.toBe(
      'universal_scene_7class'
    );

    await AppSettingsService.setString(
      'mediapipe_classifier_model_id',
      'personal_household_8class'
    );
    await expect(AppSettingsService.getMediaPipeClassifierModelId()).resolves.toBe(
      'personal_dual_dish'
    );
    await expect(AppSettingsService.getString('mediapipe_classifier_model_id', null)).resolves.toBe(
      'personal_household_8class'
    );

    await AppSettingsService.setString(
      'mediapipe_classifier_model_id',
      'personal_multilabel_44tag'
    );
    await AppSettingsService.setString('mediapipe_model_personal_multilabel_44tag_status', 'ready');
    await expect(AppSettingsService.getMediaPipeClassifierModelId()).resolves.toBe(
      'personal_dual_dish'
    );
    await expect(AppSettingsService.getString('mediapipe_classifier_model_id', null)).resolves.toBe(
      'personal_multilabel_44tag'
    );
    await expect(
      AppSettingsService.getString('mediapipe_model_personal_multilabel_44tag_status', null)
    ).resolves.toBe('ready');
    expect(getMealInputAssistEnvironmentRevision()).toBe(initialRevision);
  });

  test('migrateLegacyMediaPipeModelSettings explicitly migrates legacy ID and deletes 12 legacy keys', async () => {
    await AppSettingsService.setString(
      'mediapipe_classifier_model_id',
      'personal_multilabel_44tag'
    );
    await AppSettingsService.setString('mediapipe_model_personal_multilabel_44tag_status', 'ready');
    await AppSettingsService.setString('mediapipe_model_personal_household_8class_version', 'v1');
    await AppSettingsService.setString(
      'mediapipe_model_universal_scene_7class_error_message',
      'legacy-err'
    );

    await expect(AppSettingsService.migrateLegacyMediaPipeModelSettings()).resolves.toBe(true);

    await expect(AppSettingsService.getString('mediapipe_classifier_model_id', null)).resolves.toBe(
      'personal_dual_dish'
    );
    await expect(
      AppSettingsService.getString('mediapipe_model_personal_multilabel_44tag_status', null)
    ).resolves.toBeNull();
    await expect(
      AppSettingsService.getString('mediapipe_model_personal_household_8class_version', null)
    ).resolves.toBeNull();
    await expect(
      AppSettingsService.getString('mediapipe_model_universal_scene_7class_error_message', null)
    ).resolves.toBeNull();

    await expect(AppSettingsService.migrateLegacyMediaPipeModelSettings()).resolves.toBe(false);
  });

  test('does not invalidate AI environment directly when saving settings (no layer inversion)', async () => {
    const initialRevision = getMealInputAssistEnvironmentRevision();

    await AppSettingsService.setAiInputAssistEnabled(true);
    await AppSettingsService.setMediaPipeClassifierModelId('universal_dining_23class');

    expect(getMealInputAssistEnvironmentRevision()).toBe(initialRevision);
  });

  test('persists and clears per-model MediaPipe state via unified prefix helpers', async () => {
    await AppSettingsService.setMediaPipeModelStatusForModel('universal_dining_23class', 'ready');
    await AppSettingsService.setMediaPipeModelVersionForModel(
      'universal_dining_23class',
      'mediapipe-model-v0.2.0'
    );
    await AppSettingsService.setMediaPipeModelDownloadedAtForModel(
      'universal_dining_23class',
      987654
    );
    await AppSettingsService.setMediaPipeModelErrorMessageForModel(
      'universal_dining_23class',
      'minor warning'
    );

    await expect(
      AppSettingsService.getMediaPipeModelStatusForModel('universal_dining_23class')
    ).resolves.toBe('ready');
    await expect(
      AppSettingsService.getMediaPipeModelVersionForModel('universal_dining_23class')
    ).resolves.toBe('mediapipe-model-v0.2.0');
    await expect(
      AppSettingsService.getMediaPipeModelDownloadedAtForModel('universal_dining_23class')
    ).resolves.toBe(987654);
    await expect(
      AppSettingsService.getMediaPipeModelErrorMessageForModel('universal_dining_23class')
    ).resolves.toBe('minor warning');

    await AppSettingsService.setMediaPipeModelVersionForModel('universal_dining_23class', null);
    await AppSettingsService.setMediaPipeModelDownloadedAtForModel(
      'universal_dining_23class',
      null
    );
    await AppSettingsService.setMediaPipeModelErrorMessageForModel(
      'universal_dining_23class',
      null
    );
    await AppSettingsService.setString(
      'mediapipe_model_universal_dining_23class_status',
      'invalid'
    );

    await expect(
      AppSettingsService.getMediaPipeModelStatusForModel('universal_dining_23class')
    ).resolves.toBe('not_installed');
    await expect(
      AppSettingsService.getMediaPipeModelVersionForModel('universal_dining_23class')
    ).resolves.toBeNull();
    await expect(
      AppSettingsService.getMediaPipeModelDownloadedAtForModel('universal_dining_23class')
    ).resolves.toBeNull();
    await expect(
      AppSettingsService.getMediaPipeModelErrorMessageForModel('universal_dining_23class')
    ).resolves.toBeNull();
  });

  test('falls back to cooking_method_9class for unknown model ID', async () => {
    await AppSettingsService.setString(
      'mediapipe_classifier_model_id',
      'unknown_future_or_corrupt_id'
    );
    await expect(AppSettingsService.getMediaPipeClassifierModelId()).resolves.toBe(
      'cooking_method_9class'
    );
  });
});
