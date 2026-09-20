import type { BackupManifest } from './types';

export const CURRENT_BACKUP_FORMAT_VERSION = 1;
export const BACKUP_APP_ID = 'com.tahosook.diningmemory';

export interface CreateBackupManifestOptions {
  appVersion: string;
  schemaVersion: number;
  mealCount: number;
  photoCount: number;
  exportedAt?: Date;
  appId?: string;
}

export function createBackupManifest(options: CreateBackupManifestOptions): BackupManifest {
  return {
    formatVersion: CURRENT_BACKUP_FORMAT_VERSION,
    appId: options.appId ?? BACKUP_APP_ID,
    appVersion: options.appVersion,
    schemaVersion: options.schemaVersion,
    exportedAt: (options.exportedAt ?? new Date()).toISOString(),
    mealCount: options.mealCount,
    photoCount: options.photoCount,
  };
}

export interface ValidateManifestResult {
  valid: boolean;
  manifest?: BackupManifest;
  error?: string;
}

export function validateBackupManifest(
  raw: unknown,
  currentSchemaVersion: number
): ValidateManifestResult {
  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      error: 'マニフェストファイルが不正です（JSONオブジェクトではありません）。',
    };
  }

  const manifest = raw as Partial<BackupManifest>;

  if (typeof manifest.formatVersion !== 'number') {
    return {
      valid: false,
      error: 'バックアップ形式バージョン（formatVersion）が指定されていません。',
    };
  }

  if (manifest.formatVersion > CURRENT_BACKUP_FORMAT_VERSION) {
    return {
      valid: false,
      error: `このバックアップは新しいバージョンのアプリ（形式バージョン: ${manifest.formatVersion}）で作成されているため、このバージョンのアプリでは復元できません。`,
    };
  }

  if (manifest.formatVersion < 1) {
    return { valid: false, error: '不正なバックアップ形式バージョンです。' };
  }

  if (!manifest.appId || typeof manifest.appId !== 'string' || manifest.appId !== BACKUP_APP_ID) {
    return {
      valid: false,
      error:
        'このバックアップは別のアプリから作成されたか、アプリケーション識別子（appId）が不正です。',
    };
  }

  if (typeof manifest.schemaVersion !== 'number' || manifest.schemaVersion <= 0) {
    return { valid: false, error: 'データベーススキーマバージョン（schemaVersion）が不正です。' };
  }

  if (manifest.schemaVersion !== currentSchemaVersion) {
    return {
      valid: false,
      error: `このバックアップのデータベーススキーマバージョン（${manifest.schemaVersion}）は、現在のアプリ（${currentSchemaVersion}）と互換性がありません。`,
    };
  }

  if (typeof manifest.exportedAt !== 'string' || Number.isNaN(Date.parse(manifest.exportedAt))) {
    return { valid: false, error: 'エクスポート日時（exportedAt）が不正です。' };
  }

  if (
    typeof manifest.mealCount !== 'number' ||
    manifest.mealCount < 0 ||
    !Number.isInteger(manifest.mealCount)
  ) {
    return { valid: false, error: '食事記録件数（mealCount）が不正です。' };
  }

  if (
    typeof manifest.photoCount !== 'number' ||
    manifest.photoCount < 0 ||
    !Number.isInteger(manifest.photoCount)
  ) {
    return { valid: false, error: '写真件数（photoCount）が不正です。' };
  }

  return {
    valid: true,
    manifest: {
      formatVersion: manifest.formatVersion,
      appId: typeof manifest.appId === 'string' ? manifest.appId : BACKUP_APP_ID,
      appVersion: typeof manifest.appVersion === 'string' ? manifest.appVersion : 'unknown',
      schemaVersion: manifest.schemaVersion,
      exportedAt: manifest.exportedAt,
      mealCount: manifest.mealCount,
      photoCount: manifest.photoCount,
    },
  };
}
