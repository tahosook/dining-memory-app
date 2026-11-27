import type { MealInputAssistModelStatus } from '../../../ai/mealInputAssist';
import type { AiAssistState } from '../../../hooks/settings/useSettingsAiInputAssist';

/** Formats a local AI model installation status into a Japanese UI badge label. */
export function formatModelStatusLabel(
  status: 'not_installed' | 'ready' | 'error' | 'downloading'
): string {
  switch (status) {
    case 'ready':
      return '利用可能';
    case 'error':
      return 'エラー';
    case 'downloading':
      return 'ダウンロード中';
    default:
      return '未導入';
  }
}

/** Formats the top-level AI input assist readiness state into a Japanese status label. */
export function formatAiAssistStateLabel(status: AiAssistState): string {
  switch (status) {
    case 'checking':
      return '確認中';
    case 'downloading':
      return 'ダウンロード中';
    case 'ready':
      return '利用可能';
    case 'error':
      return 'エラー';
    default:
      return '未準備';
  }
}

/** Returns the descriptive summary copy corresponding to the AI input assist state. */
export function buildAiAssistDescription(status: AiAssistState): string {
  switch (status) {
    case 'checking':
      return 'AI入力補助を利用できるか確認しています。';
    case 'downloading':
      return 'AI入力補助に必要なデータを端末へ保存しています。';
    case 'ready':
      return '写真を外部送信せず、端末内で食事メモの下書きを作成できます。';
    case 'error':
      return 'AI入力補助の準備に問題があります。再ダウンロードを試してください。';
    default:
      return 'モデルをダウンロードすると、撮影後に食事メモの下書きを作成できます。';
  }
}

/** Formats a normalized [0, 1] progress ratio as a rounded percentage string. */
export function formatProgressPercentage(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return `${Math.round(value * 100)}%`;
}

/** Formats a byte count into human-readable B/KB/MB/GB/TB units. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return null;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** Checks whether the specified managed GGUF file key exists on disk. */
export function isManagedFileInstalled(
  status: MealInputAssistModelStatus,
  key: 'model' | 'projector'
): boolean {
  return key === 'model' ? status.files.modelExists : status.files.projectorExists;
}
