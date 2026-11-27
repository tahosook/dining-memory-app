import * as Crypto from 'expo-crypto';
import { deleteAsync, getInfoAsync, makeDirectoryAsync, moveAsync } from 'expo-file-system/legacy';

/** Converts an unknown error into a localized installer failure message. */
export function toInstallerErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim()) {
    return `${fallbackMessage}: ${error.message}`;
  }

  return fallbackMessage;
}

/** Ensures the local AI model directory exists before writing temporary or final files. */
export async function ensureModelDirectory(directoryPath: string): Promise<void> {
  await makeDirectoryAsync(directoryPath, { intermediates: true });
}

/** Checks whether a file path exists without throwing on null paths. */
export async function fileExists(path: string | null): Promise<boolean> {
  if (!path) {
    return false;
  }

  const info = await getInfoAsync(path);
  return Boolean(info.exists);
}

/** Deletes a file if it exists, swallowing deletion errors during cleanup. */
export async function cleanupFile(path: string | null): Promise<void> {
  if (!path) {
    return;
  }

  await deleteAsync(path, { idempotent: true }).catch(() => undefined);
}

/** Generates a unique temporary download path inside the model directory. */
export function createTemporaryDownloadPath(directoryPath: string, fileName: string): string {
  return `${directoryPath}/${fileName}.download-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;
}

function createBackupPath(targetPath: string): string {
  return `${targetPath}.backup-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;
}

/** Replaces a target file with a downloaded temporary file without backup rollback. */
export async function replaceFile(from: string, to: string): Promise<void> {
  if (await fileExists(to)) {
    await deleteAsync(to, { idempotent: true });
  }

  await moveAsync({ from, to });
}

/**
 * Atomically replaces a single model file with backup-and-restore rollback if placement fails.
 */
export async function safelyReplaceFile(from: string, to: string): Promise<void> {
  if (!(await fileExists(to))) {
    await moveAsync({ from, to });
    return;
  }

  const backupPath = createBackupPath(to);
  await moveAsync({ from: to, to: backupPath });

  try {
    await moveAsync({ from, to });
    await cleanupFile(backupPath);
  } catch (moveError) {
    try {
      await moveAsync({ from: backupPath, to });
    } catch {
      // Preserve the original placement failure if backup restoration also fails.
    }
    throw moveError;
  }
}

export interface ReplaceFilePairParams {
  targetMainPath: string;
  targetSidePath: string;
  tempMainPath: string;
  tempSidePath: string;
  commit: () => Promise<void>;
}

/**
 * Atomically replaces a dual-model file pair, runs `commit` before deleting backups,
 * and rolls back both files on placement or commit failure.
 */
export async function safelyReplaceFilePair({
  targetMainPath,
  targetSidePath,
  tempMainPath,
  tempSidePath,
  commit,
}: ReplaceFilePairParams): Promise<void> {
  let remainingTempMain: string | null = tempMainPath;
  let remainingTempSide: string | null = tempSidePath;
  let backupMainPath: string | null = null;
  let backupSidePath: string | null = null;
  let mainPlaced = false;
  let sidePlaced = false;

  try {
    const [existingMain, existingSide] = await Promise.all([
      fileExists(targetMainPath),
      fileExists(targetSidePath),
    ]);

    if (existingMain) {
      backupMainPath = createBackupPath(targetMainPath);
      await moveAsync({ from: targetMainPath, to: backupMainPath });
    }

    if (existingSide) {
      backupSidePath = createBackupPath(targetSidePath);
      await moveAsync({ from: targetSidePath, to: backupSidePath });
    }

    await moveAsync({ from: tempMainPath, to: targetMainPath });
    mainPlaced = true;
    remainingTempMain = null;

    await moveAsync({ from: tempSidePath, to: targetSidePath });
    sidePlaced = true;
    remainingTempSide = null;

    await commit();

    await Promise.all([cleanupFile(backupMainPath), cleanupFile(backupSidePath)]);
    backupMainPath = null;
    backupSidePath = null;
  } catch (error) {
    if (mainPlaced) {
      await cleanupFile(targetMainPath);
    }
    if (sidePlaced) {
      await cleanupFile(targetSidePath);
    }

    if (backupMainPath) {
      await moveAsync({ from: backupMainPath, to: targetMainPath }).catch(() => undefined);
      backupMainPath = null;
    }
    if (backupSidePath) {
      await moveAsync({ from: backupSidePath, to: targetSidePath }).catch(() => undefined);
      backupSidePath = null;
    }

    throw error;
  } finally {
    await Promise.all([
      cleanupFile(remainingTempMain),
      cleanupFile(remainingTempSide),
      cleanupFile(backupMainPath),
      cleanupFile(backupSidePath),
    ]);
  }
}
