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
});
