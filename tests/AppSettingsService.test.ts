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
});
