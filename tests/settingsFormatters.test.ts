import {
  buildAiAssistDescription,
  formatAiAssistStateLabel,
  formatBytes,
  formatModelStatusLabel,
  formatProgressPercentage,
  isManagedFileInstalled,
} from '../src/components/screens/SettingsScreen/settingsFormatters';
import type { MealInputAssistModelStatus } from '../src/ai/mealInputAssist';

describe('settingsFormatters', () => {
  test('formatModelStatusLabel maps status kinds to Japanese labels', () => {
    expect(formatModelStatusLabel('ready')).toBe('利用可能');
    expect(formatModelStatusLabel('error')).toBe('エラー');
    expect(formatModelStatusLabel('downloading')).toBe('ダウンロード中');
    expect(formatModelStatusLabel('not_installed')).toBe('未導入');
  });

  test('formatAiAssistStateLabel and buildAiAssistDescription map all AI assist states', () => {
    expect(formatAiAssistStateLabel('checking')).toBe('確認中');
    expect(formatAiAssistStateLabel('downloading')).toBe('ダウンロード中');
    expect(formatAiAssistStateLabel('ready')).toBe('利用可能');
    expect(formatAiAssistStateLabel('error')).toBe('エラー');
    expect(formatAiAssistStateLabel('not_ready')).toBe('未準備');

    expect(buildAiAssistDescription('checking')).toContain('確認');
    expect(buildAiAssistDescription('downloading')).toContain('保存');
    expect(buildAiAssistDescription('ready')).toContain('外部送信せず');
    expect(buildAiAssistDescription('error')).toContain('再ダウンロード');
    expect(buildAiAssistDescription('not_ready')).toContain('ダウンロードすると');
  });

  test('formatProgressPercentage formats valid ratios and rejects invalid inputs', () => {
    expect(formatProgressPercentage(0)).toBe('0%');
    expect(formatProgressPercentage(0.256)).toBe('26%');
    expect(formatProgressPercentage(1)).toBe('100%');
    expect(formatProgressPercentage(null)).toBeNull();
    expect(formatProgressPercentage(undefined)).toBeNull();
    expect(formatProgressPercentage(Number.NaN)).toBeNull();
  });

  test('formatBytes formats B, KB, MB, GB, TB and handles invalid inputs', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(-1)).toBeNull();
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(Number.NaN)).toBeNull();
  });

  test('isManagedFileInstalled checks model and projector flags accurately', () => {
    const status: MealInputAssistModelStatus = {
      kind: 'error',
      version: null,
      downloadedAt: null,
      errorMessage: null,
      expectedPaths: [],
      files: {
        modelExists: true,
        projectorExists: false,
      },
    };

    expect(isManagedFileInstalled(status, 'model')).toBe(true);
    expect(isManagedFileInstalled(status, 'projector')).toBe(false);
  });
});
