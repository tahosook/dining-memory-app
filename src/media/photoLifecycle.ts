import {
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  readDirectoryAsync,
} from 'expo-file-system/legacy';
import { getAllPersistedMealRows } from '../database/services/localDatabase';
import { extractPhotoFileName, validateSafeFileName } from '../domain/backup/pathNormalizer';
import { resolveThumbnailDestinationUri } from './photoStorage';
import { getInFlightThumbnailPhotoPaths } from './mealThumbnail';
import { sanitizeLogObject } from '../utils/logSanitizer';

/**
 * Dining Memory が管理する食事写真（メイン写真または派生サムネイル）の命名パターン。
 *
 * 対象:
 * - meal-*.jpg / meal-*.jpeg / meal-*.png (通常撮影、フォールバック、回転写真、インポート写真)
 * - *-thumb.jpg / *-thumb.jpeg / *-thumb.png (派生サムネイル)
 *
 * 除外（削除対象外）:
 * - SQLite データベースファイル（.db, .db-shm, .db-wal 等）
 * - AI モデルディレクトリおよびモデルファイル（ai-models/ 等）
 * - JSON ファイル（バックアップ、マニフェスト等）
 * - システムファイルや隠しファイル
 * - パストラバーサル（.. や / や \）を含む不正名
 */
const MANAGED_MEAL_PHOTO_NAME_REGEX = /^(meal-[a-zA-Z0-9_.-]+|.+?-thumb)\.(jpe?g|png)$/i;

/**
 * 指定されたファイル名が Dining Memory 管理下の安全な食事写真ファイル名かを判定する。
 */
export function isManagedMealPhotoFileName(fileName: string): boolean {
  if (!validateSafeFileName(fileName)) {
    return false;
  }

  // 隠しファイルやシステムファイルは除外
  if (fileName.startsWith('.')) {
    return false;
  }

  return MANAGED_MEAL_PHOTO_NAME_REGEX.test(fileName);
}

export interface ReferencedPhotoOptions {
  includeDeleted?: boolean;
}

/**
 * DB 内で現在参照されているすべての写真パスおよびサムネイルパス、
 * さらに現在非同期生成中（in-flight）のタスクが参照する写真・サムネイルパスを合算した
 * 「削除保護集合」を作成する。
 *
 * soft delete (is_deleted = 1) のレコードは、バックアップ整合性および論理削除セマンティクスを
 * 保持するため、デフォルトで保護対象に含める。
 */
export async function getReferencedPhotoPaths(
  options: ReferencedPhotoOptions = {}
): Promise<Set<string>> {
  const includeDeleted = options.includeDeleted ?? true;
  const referencedSet = new Set<string>();

  // 1. DB から全レコードを取得して参照パスを登録
  const rows = await getAllPersistedMealRows();
  for (const row of rows) {
    if (!includeDeleted && row.is_deleted) {
      continue;
    }

    if (row.photo_path && typeof row.photo_path === 'string') {
      referencedSet.add(row.photo_path);
      const fileName = extractPhotoFileName(row.photo_path);
      if (fileName) {
        referencedSet.add(fileName);
      }
    }

    if (row.photo_thumbnail_path && typeof row.photo_thumbnail_path === 'string') {
      referencedSet.add(row.photo_thumbnail_path);
      const thumbFileName = extractPhotoFileName(row.photo_thumbnail_path);
      if (thumbFileName) {
        referencedSet.add(thumbFileName);
      }
    }
  }

  // 2. 非同期サムネイル生成中 (in-flight) の写真および生成予定サムネイルを保護対象に追加 (Issue #102 race 対策)
  const inFlightProtectionSet = getInFlightThumbnailProtectionSet();
  for (const inFlightPath of inFlightProtectionSet) {
    referencedSet.add(inFlightPath);
  }

  return referencedSet;
}

/**
 * 非同期サムネイル生成中（in-flight）タスクの写真および生成予定サムネイルの保護集合を取得する。
 * メモリ上のタスク情報を参照するため、DB アクセスを伴わず超高速（O(1)）に実行される。
 *
 * 注: ensureMealThumbnail(mealId) のように mealId のみで非同期解決待ち（inFlightMealMap）のタスクは、
 * 対象写真パスがすでに DB（meals テーブル）に存在するため、DB 参照側の保護集合によって保護されます。
 */
export function getInFlightThumbnailProtectionSet(): Set<string> {
  const protectionSet = new Set<string>();
  const inFlightPaths = getInFlightThumbnailPhotoPaths();
  for (const inFlightPath of inFlightPaths) {
    protectionSet.add(inFlightPath);
    const fileName = extractPhotoFileName(inFlightPath);
    if (fileName) {
      protectionSet.add(fileName);
    }

    // 生成予定のサムネイルパスも保護
    const expectedThumbUri = resolveThumbnailDestinationUri(inFlightPath);
    protectionSet.add(expectedThumbUri);
    const expectedThumbFileName = extractPhotoFileName(expectedThumbUri);
    if (expectedThumbFileName) {
      protectionSet.add(expectedThumbFileName);
    }
  }
  return protectionSet;
}

export interface OrphanScanOptions extends ReferencedPhotoOptions {
  matcher?: (fileName: string) => boolean;
  referencedPaths?: Set<string>;
}

export interface OrphanScanResult {
  referencedFileNames: Set<string>;
  scannedFileCount: number;
  orphanFileNames: string[];
  orphanUris: string[];
}

/**
 * documentDirectory 直下のファイルを走査し、DB参照集合および in-flight 保護集合に
 * 含まれない管理対象写真ファイル（孤児ファイル）を検出する。
 */
export async function findOrphanedPhotoFiles(
  options: OrphanScanOptions = {}
): Promise<OrphanScanResult> {
  if (!documentDirectory) {
    return {
      referencedFileNames: options.referencedPaths ?? new Set(),
      scannedFileCount: 0,
      orphanFileNames: [],
      orphanUris: [],
    };
  }

  const docDir = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  const referenced = options.referencedPaths ?? (await getReferencedPhotoPaths(options));
  const matcher = options.matcher ?? isManagedMealPhotoFileName;

  let entries: string[] = [];
  try {
    entries = await readDirectoryAsync(documentDirectory);
  } catch (readError) {
    console.warn('[photoLifecycle] Failed to read documentDirectory:', readError);
    return {
      referencedFileNames: referenced,
      scannedFileCount: 0,
      orphanFileNames: [],
      orphanUris: [],
    };
  }

  const orphanFileNames: string[] = [];
  const orphanUris: string[] = [];

  for (const entry of entries) {
    // 安全境界チェック: Dining Memory 管理対象の画像ファイル名パターンに合致しないものは無視
    if (!matcher(entry)) {
      continue;
    }

    const candidateUri = `${docDir}${entry}`;

    // 参照中または保護対象であればスキップ
    if (referenced.has(entry) || referenced.has(candidateUri)) {
      continue;
    }

    // ディレクトリや実在しないファイルは除外
    try {
      const fileInfo = await getInfoAsync(candidateUri);
      if (!fileInfo.exists || fileInfo.isDirectory) {
        continue;
      }
    } catch {
      continue;
    }

    orphanFileNames.push(entry);
    orphanUris.push(candidateUri);
  }

  return {
    referencedFileNames: referenced,
    scannedFileCount: entries.length,
    orphanFileNames,
    orphanUris,
  };
}

export interface CleanupOrphansResult {
  deletedFileNames: string[];
  failedFileNames: string[];
  skippedFileNames?: string[];
  scannedFileCount: number;
}

/**
 * 検出された孤児写真ファイルを安全に物理削除する。
 *
 * 各ファイルの削除前に3段階の保護チェックを行う:
 * 1. 早期スキップ: ループ開始前に取得した DB 参照スナップショットで明らかに保護対象を除外
 * 2. 最新DB参照: 削除直前に getReferencedPhotoPaths() を再取得し、scan 後に DB 参照が
 *    復活した場合の race condition を完全に防止する
 * 3. 最新in-flight: 削除直前にインメモリの非同期サムネイル生成タスクを確認し、
 *    Issue #102 との競合を防止する
 *
 * 対象が documentDirectory 直下であり、かつ安全な命名規則を満たしていることも再確認する。
 */
export async function cleanupOrphanedPhotoFiles(
  options: OrphanScanOptions = {}
): Promise<CleanupOrphansResult> {
  const scanResult = await findOrphanedPhotoFiles(options);

  if (!documentDirectory || scanResult.orphanUris.length === 0) {
    return {
      deletedFileNames: [],
      failedFileNames: [],
      skippedFileNames: [],
      scannedFileCount: scanResult.scannedFileCount,
    };
  }

  const docDir = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  const matcher = options.matcher ?? isManagedMealPhotoFileName;

  // 削除ループ準備時点での初期DB参照（早期スキップ用補助スナップショット）
  const dbReferenced = options.referencedPaths ?? (await getReferencedPhotoPaths(options));

  const deletedFileNames: string[] = [];
  const failedFileNames: string[] = [];
  const skippedFileNames: string[] = [];

  for (let i = 0; i < scanResult.orphanUris.length; i++) {
    const uri = scanResult.orphanUris[i];
    const fileName = scanResult.orphanFileNames[i];

    // 1. 安全な対象か（documentDirectory 直下、かつ命名規則を満たしていることを確認）
    if (!uri.startsWith(docDir) || !matcher(fileName)) {
      console.warn(
        '[photoLifecycle] Refusing to delete file that violated safety invariants:',
        sanitizeLogObject(uri)
      );
      failedFileNames.push(fileName);
      continue;
    }

    // 早期スキップ判定（ループ開始時点で既に参照されていた場合）
    if (dbReferenced.has(fileName) || dbReferenced.has(uri)) {
      skippedFileNames.push(fileName);
      continue;
    }

    // 2. 最新DB参照を確認（削除直前に必ず実DBから最新状態を取得して race condition を完全に防止）
    // options.referencedPaths は使用しない：古いスナップショットで最終判定を行うと
    // scan 後〜delete 直前にDB参照が追加された写真を誤削除する可能性があるため
    const latestReferenced = await getReferencedPhotoPaths(options);
    if (latestReferenced.has(fileName) || latestReferenced.has(uri)) {
      skippedFileNames.push(fileName);
      continue;
    }

    // 3. 最新in-flight thumbnail状態を確認 (Issue #102 競合防止)
    const currentInFlight = getInFlightThumbnailProtectionSet();
    if (currentInFlight.has(fileName) || currentInFlight.has(uri)) {
      skippedFileNames.push(fileName);
      continue;
    }

    try {
      await deleteAsync(uri, { idempotent: true });
      deletedFileNames.push(fileName);
    } catch (deleteError) {
      console.warn(`[photoLifecycle] Failed to delete orphan photo: ${sanitizeLogObject(uri)}`, sanitizeLogObject(deleteError));
      failedFileNames.push(fileName);
    }
  }

  return {
    deletedFileNames,
    failedFileNames,
    skippedFileNames,
    scannedFileCount: scanResult.scannedFileCount,
  };
}
