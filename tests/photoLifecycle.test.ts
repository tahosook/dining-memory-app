import {
  deleteAsync,
  getInfoAsync,
  readDirectoryAsync,
} from 'expo-file-system/legacy';

import { getAllPersistedMealRows } from '../src/database/services/localDatabase';
import { getInFlightThumbnailPhotoPaths } from '../src/media/mealThumbnail';
import {
  cleanupOrphanedPhotoFiles,
  findOrphanedPhotoFiles,
  getReferencedPhotoPaths,
  isManagedMealPhotoFileName,
} from '../src/media/photoLifecycle';
import type { PersistedMealRow } from '../src/database/services/localDatabase';

jest.mock('expo-media-library', () => ({
  Asset: {
    create: jest.fn(),
  },
  Album: {
    get: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({

  documentDirectory: 'file:///mock-documents/',
  cacheDirectory: 'file:///mock-cache/',
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
}));

jest.mock('../src/database/services/localDatabase', () => ({
  getAllPersistedMealRows: jest.fn(),
}));

jest.mock('../src/media/mealThumbnail', () => ({
  getInFlightThumbnailPhotoPaths: jest.fn(),
}));

describe('photoLifecycle', () => {
  let mockFileSystem: Map<string, { exists: boolean; isDirectory?: boolean }>;

  function setupMockFileSystem(
    initialFiles: Record<string, { exists?: boolean; isDirectory?: boolean }>
  ) {
    mockFileSystem = new Map();
    for (const [name, meta] of Object.entries(initialFiles)) {
      mockFileSystem.set(name, {
        exists: meta.exists ?? true,
        isDirectory: meta.isDirectory ?? false,
      });
    }

    (readDirectoryAsync as jest.Mock).mockImplementation(async (dirUri: string) => {
      if (dirUri !== 'file:///mock-documents/' && dirUri !== 'file:///mock-documents') {
        throw new Error(`Unexpected directory: ${dirUri}`);
      }
      return Array.from(mockFileSystem.keys());
    });

    (getInfoAsync as jest.Mock).mockImplementation(async (fileUri: string) => {
      const fileName = fileUri.replace(/^file:\/\/\/mock-documents\//, '');
      const meta = mockFileSystem.get(fileName);
      if (!meta) {
        return { exists: false, isDirectory: false };
      }
      return { exists: meta.exists, isDirectory: meta.isDirectory ?? false };
    });

    (deleteAsync as jest.Mock).mockImplementation(async (fileUri: string) => {
      const fileName = fileUri.replace(/^file:\/\/\/mock-documents\//, '');
      if (!mockFileSystem.has(fileName)) {
        return;
      }
      mockFileSystem.delete(fileName);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (getInFlightThumbnailPhotoPaths as jest.Mock).mockReturnValue(new Set<string>());
    (getAllPersistedMealRows as jest.Mock).mockResolvedValue([]);
    setupMockFileSystem({});
  });

  describe('isManagedMealPhotoFileName', () => {
    test('identifies standard meal photos, fallbacks, rotated photos, and thumbnails', () => {
      expect(isManagedMealPhotoFileName('meal-20260420120000.jpg')).toBe(true);
      expect(isManagedMealPhotoFileName('meal-20260420120000-1.jpg')).toBe(true);
      expect(isManagedMealPhotoFileName('meal-20260420120000-fallback-abc123.jpg')).toBe(true);
      expect(
        isManagedMealPhotoFileName(
          'meal-photo-rotated-2026-04-20T10-11-12-123Z-12345678.jpg'
        )
      ).toBe(true);
      expect(isManagedMealPhotoFileName('meal-20260420120000-thumb.jpg')).toBe(true);
      expect(isManagedMealPhotoFileName('meal-photo-rotated-123-thumb.jpg')).toBe(true);
      expect(isManagedMealPhotoFileName('photo-A-thumb.jpg')).toBe(true);
      expect(isManagedMealPhotoFileName('custom-thumb.png')).toBe(true);
    });

    test('rejects database files, JSON metadata, AI models, directories, and arbitrary files', () => {
      expect(isManagedMealPhotoFileName('DiningMemory.db')).toBe(false);
      expect(isManagedMealPhotoFileName('DiningMemory.db-wal')).toBe(false);
      expect(isManagedMealPhotoFileName('DiningMemory.db-shm')).toBe(false);
      expect(isManagedMealPhotoFileName('manifest.json')).toBe(false);
      expect(isManagedMealPhotoFileName('meals.json')).toBe(false);
      expect(isManagedMealPhotoFileName('ai-models')).toBe(false);
      expect(isManagedMealPhotoFileName('meal-input-assist.gguf')).toBe(false);
      expect(isManagedMealPhotoFileName('notes.txt')).toBe(false);
      expect(isManagedMealPhotoFileName('document.pdf')).toBe(false);
      expect(isManagedMealPhotoFileName('.hidden-image.jpg')).toBe(false);
    });

    test('rejects path traversal and unsafe filenames', () => {
      expect(isManagedMealPhotoFileName('../meal-1.jpg')).toBe(false);
      expect(isManagedMealPhotoFileName('meal-1.jpg/foo')).toBe(false);
      expect(isManagedMealPhotoFileName('..\\meal-1.jpg')).toBe(false);
      expect(isManagedMealPhotoFileName('meal-1\0.jpg')).toBe(false);
    });
  });

  describe('getReferencedPhotoPaths', () => {
    test('collects photo_path and photo_thumbnail_path including both URI and filename', async () => {
      const mockRows: Partial<PersistedMealRow>[] = [
        {
          id: 'meal-1',
          photo_path: 'file:///mock-documents/meal-A.jpg',
          photo_thumbnail_path: 'file:///mock-documents/meal-A-thumb.jpg',
          is_deleted: 0,
        },
      ];
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue(mockRows);

      const referenced = await getReferencedPhotoPaths();

      expect(referenced.has('file:///mock-documents/meal-A.jpg')).toBe(true);
      expect(referenced.has('meal-A.jpg')).toBe(true);
      expect(referenced.has('file:///mock-documents/meal-A-thumb.jpg')).toBe(true);
      expect(referenced.has('meal-A-thumb.jpg')).toBe(true);
    });

    test('protects soft-deleted (is_deleted = 1) meal photos by default', async () => {
      const mockRows: Partial<PersistedMealRow>[] = [
        {
          id: 'meal-deleted',
          photo_path: 'file:///mock-documents/meal-soft-deleted.jpg',
          photo_thumbnail_path: 'file:///mock-documents/meal-soft-deleted-thumb.jpg',
          is_deleted: 1,
        },
      ];
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue(mockRows);

      const referenced = await getReferencedPhotoPaths();
      expect(referenced.has('meal-soft-deleted.jpg')).toBe(true);
      expect(referenced.has('meal-soft-deleted-thumb.jpg')).toBe(true);

      const excludeDeleted = await getReferencedPhotoPaths({ includeDeleted: false });
      expect(excludeDeleted.has('meal-soft-deleted.jpg')).toBe(false);
    });

    test('protects in-flight thumbnail photo paths and derived thumbnail paths', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([]);
      (getInFlightThumbnailPhotoPaths as jest.Mock).mockReturnValue(
        new Set(['file:///mock-documents/meal-in-flight.jpg'])
      );

      const referenced = await getReferencedPhotoPaths();

      expect(referenced.has('file:///mock-documents/meal-in-flight.jpg')).toBe(true);
      expect(referenced.has('meal-in-flight.jpg')).toBe(true);
      expect(referenced.has('file:///mock-documents/meal-in-flight-thumb.jpg')).toBe(true);
      expect(referenced.has('meal-in-flight-thumb.jpg')).toBe(true);
    });
  });

  describe('Lifecycle Scenarios (Cases 1 - 4)', () => {
    test('Case 1: DB references A.jpg and A-thumb.jpg; FS has both -> neither is deleted', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        {
          id: 'meal-1',
          photo_path: 'file:///mock-documents/meal-A.jpg',
          photo_thumbnail_path: 'file:///mock-documents/meal-A-thumb.jpg',
          is_deleted: 0,
        },
      ]);
      setupMockFileSystem({
        'meal-A.jpg': { exists: true },
        'meal-A-thumb.jpg': { exists: true },
      });

      const scanResult = await findOrphanedPhotoFiles();
      expect(scanResult.orphanFileNames).toHaveLength(0);

      const cleanupResult = await cleanupOrphanedPhotoFiles();
      expect(cleanupResult.deletedFileNames).toHaveLength(0);
      expect(deleteAsync).not.toHaveBeenCalled();
      expect(mockFileSystem.has('meal-A.jpg')).toBe(true);
      expect(mockFileSystem.has('meal-A-thumb.jpg')).toBe(true);
    });

    test('Case 2: DB references B.jpg with null thumb; FS has A.jpg, A-thumb.jpg, B.jpg -> A series deleted, B.jpg kept', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        {
          id: 'meal-1',
          photo_path: 'file:///mock-documents/meal-B.jpg',
          photo_thumbnail_path: null,
          is_deleted: 0,
        },
      ]);
      setupMockFileSystem({
        'meal-A.jpg': { exists: true },
        'meal-A-thumb.jpg': { exists: true },
        'meal-B.jpg': { exists: true },
      });

      const scanResult = await findOrphanedPhotoFiles();
      expect(scanResult.orphanFileNames).toEqual(
        expect.arrayContaining(['meal-A.jpg', 'meal-A-thumb.jpg'])
      );
      expect(scanResult.orphanFileNames).not.toContain('meal-B.jpg');

      const cleanupResult = await cleanupOrphanedPhotoFiles();
      expect(cleanupResult.deletedFileNames).toEqual(
        expect.arrayContaining(['meal-A.jpg', 'meal-A-thumb.jpg'])
      );
      expect(cleanupResult.deletedFileNames).not.toContain('meal-B.jpg');

      expect(deleteAsync).toHaveBeenCalledWith(
        'file:///mock-documents/meal-A.jpg',
        { idempotent: true }
      );
      expect(deleteAsync).toHaveBeenCalledWith(
        'file:///mock-documents/meal-A-thumb.jpg',
        { idempotent: true }
      );
      expect(deleteAsync).not.toHaveBeenCalledWith(
        'file:///mock-documents/meal-B.jpg',
        expect.anything()
      );

      expect(mockFileSystem.has('meal-A.jpg')).toBe(false);
      expect(mockFileSystem.has('meal-A-thumb.jpg')).toBe(false);
      expect(mockFileSystem.has('meal-B.jpg')).toBe(true);
    });

    test('Case 3: DB references B.jpg and B-thumb.jpg; FS has A series and B series -> only A series deleted', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        {
          id: 'meal-1',
          photo_path: 'file:///mock-documents/meal-B.jpg',
          photo_thumbnail_path: 'file:///mock-documents/meal-B-thumb.jpg',
          is_deleted: 0,
        },
      ]);
      setupMockFileSystem({
        'meal-A.jpg': { exists: true },
        'meal-A-thumb.jpg': { exists: true },
        'meal-B.jpg': { exists: true },
        'meal-B-thumb.jpg': { exists: true },
      });

      const cleanupResult = await cleanupOrphanedPhotoFiles();
      expect(cleanupResult.deletedFileNames).toEqual(
        expect.arrayContaining(['meal-A.jpg', 'meal-A-thumb.jpg'])
      );
      expect(cleanupResult.deletedFileNames).not.toContain('meal-B.jpg');
      expect(cleanupResult.deletedFileNames).not.toContain('meal-B-thumb.jpg');

      expect(mockFileSystem.has('meal-A.jpg')).toBe(false);
      expect(mockFileSystem.has('meal-A-thumb.jpg')).toBe(false);
      expect(mockFileSystem.has('meal-B.jpg')).toBe(true);
      expect(mockFileSystem.has('meal-B-thumb.jpg')).toBe(true);
    });

    test('Case 4: Thumbnail not yet generated (DB has B.jpg, thumb null; FS has B.jpg) -> B.jpg is NEVER deleted', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        {
          id: 'meal-1',
          photo_path: 'file:///mock-documents/meal-B.jpg',
          photo_thumbnail_path: null,
          is_deleted: 0,
        },
      ]);
      setupMockFileSystem({
        'meal-B.jpg': { exists: true },
      });

      const scanResult = await findOrphanedPhotoFiles();
      expect(scanResult.orphanFileNames).toHaveLength(0);

      const cleanupResult = await cleanupOrphanedPhotoFiles();
      expect(cleanupResult.deletedFileNames).toHaveLength(0);
      expect(deleteAsync).not.toHaveBeenCalled();
      expect(mockFileSystem.has('meal-B.jpg')).toBe(true);
    });
  });

  describe('Race Condition Protection with Async Thumbnail Generation', () => {
    test('does not delete old photo A if thumbnail generation for A is still in-flight, even after photo rotated to B in DB', async () => {
      // Rotation occurred: DB now references B.jpg
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        {
          id: 'meal-1',
          photo_path: 'file:///mock-documents/meal-B.jpg',
          photo_thumbnail_path: null,
          is_deleted: 0,
        },
      ]);
      // BUT generation task for A is still in-flight!
      (getInFlightThumbnailPhotoPaths as jest.Mock).mockReturnValue(
        new Set(['file:///mock-documents/meal-A.jpg'])
      );

      setupMockFileSystem({
        'meal-A.jpg': { exists: true },
        'meal-B.jpg': { exists: true },
        'meal-orphan-other.jpg': { exists: true },
      });

      // Scan: meal-A.jpg is protected by in-flight status; only meal-orphan-other.jpg is an orphan
      const scanResult = await findOrphanedPhotoFiles();
      expect(scanResult.orphanFileNames).toEqual(['meal-orphan-other.jpg']);
      expect(scanResult.orphanFileNames).not.toContain('meal-A.jpg');

      const cleanupResult = await cleanupOrphanedPhotoFiles();
      expect(cleanupResult.deletedFileNames).toEqual(['meal-orphan-other.jpg']);
      expect(mockFileSystem.has('meal-A.jpg')).toBe(true);
      expect(mockFileSystem.has('meal-B.jpg')).toBe(true);
      expect(mockFileSystem.has('meal-orphan-other.jpg')).toBe(false);

      // Once generation for A completes (no longer in-flight)
      (getInFlightThumbnailPhotoPaths as jest.Mock).mockReturnValue(new Set());
      const subsequentCleanup = await cleanupOrphanedPhotoFiles();
      expect(subsequentCleanup.deletedFileNames).toEqual(['meal-A.jpg']);
      expect(mockFileSystem.has('meal-A.jpg')).toBe(false);
    });
  });

  describe('Race Condition Protection between Scan and Delete', () => {
    // getAllPersistedMealRows is called at 3 points:
    // 1st call: inside findOrphanedPhotoFiles (scan)
    // 2nd call: dbReferenced snapshot before deletion loop
    // 3rd call: latestReferenced right before deleteAsync (always fetches from real DB)

    test('Case A: does not delete photo if DB reference is restored right before deleteAsync', async () => {
      let callCount = 0;
      (getAllPersistedMealRows as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          // 1st call (scan): A.jpg is NOT in DB -> identified as orphan
          // 2nd call (loop prep snapshot): A.jpg is still NOT in DB
          return [];
        }
        // 3rd call (right before deleteAsync): A.jpg was restored/referenced by concurrent operation!
        return [
          {
            id: 'meal-1',
            photo_path: 'file:///mock-documents/meal-A.jpg',
            photo_thumbnail_path: null,
            is_deleted: 0,
          },
        ];
      });
      (getInFlightThumbnailPhotoPaths as jest.Mock).mockReturnValue(new Set<string>());

      setupMockFileSystem({
        'meal-A.jpg': { exists: true },
      });

      const cleanupResult = await cleanupOrphanedPhotoFiles();

      // Verified: meal-A.jpg is NOT deleted because the 3rd DB query caught the restored reference
      expect(cleanupResult.deletedFileNames).not.toContain('meal-A.jpg');
      expect(deleteAsync).not.toHaveBeenCalledWith(
        'file:///mock-documents/meal-A.jpg',
        expect.anything()
      );
      expect(mockFileSystem.has('meal-A.jpg')).toBe(true);
      expect(cleanupResult.skippedFileNames).toContain('meal-A.jpg');
      // Verify the 3rd DB call (right before delete) actually happened
      expect(callCount).toBe(3);
    });

    test('Case B: does not delete photo if DB reference is restored after scan but before delete', async () => {
      let callCount = 0;
      (getAllPersistedMealRows as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // 1st call (scan): A.jpg is NOT in DB -> identified as orphan
          return [];
        }
        // 2nd call (loop prep) and 3rd call (right before delete): A.jpg is now referenced
        return [
          {
            id: 'meal-1',
            photo_path: 'file:///mock-documents/meal-A.jpg',
            photo_thumbnail_path: null,
            is_deleted: 0,
          },
        ];
      });
      (getInFlightThumbnailPhotoPaths as jest.Mock).mockReturnValue(new Set<string>());

      setupMockFileSystem({
        'meal-A.jpg': { exists: true },
      });

      const cleanupResult = await cleanupOrphanedPhotoFiles();

      // Verified: meal-A.jpg is NOT deleted (caught by early snapshot in this case)
      expect(cleanupResult.deletedFileNames).not.toContain('meal-A.jpg');
      expect(deleteAsync).not.toHaveBeenCalledWith(
        'file:///mock-documents/meal-A.jpg',
        expect.anything()
      );
      expect(mockFileSystem.has('meal-A.jpg')).toBe(true);
      expect(cleanupResult.skippedFileNames).toContain('meal-A.jpg');
    });

    test('Case C: deletes photo when it remains unreferenced through all checks', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([]);
      (getInFlightThumbnailPhotoPaths as jest.Mock).mockReturnValue(new Set<string>());

      setupMockFileSystem({
        'meal-A.jpg': { exists: true },
      });

      const cleanupResult = await cleanupOrphanedPhotoFiles();

      expect(cleanupResult.deletedFileNames).toContain('meal-A.jpg');
      expect(deleteAsync).toHaveBeenCalledWith(
        'file:///mock-documents/meal-A.jpg',
        { idempotent: true }
      );
      expect(mockFileSystem.has('meal-A.jpg')).toBe(false);
      expect(cleanupResult.skippedFileNames).not.toContain('meal-A.jpg');
    });

    test('Case D: does not delete photo if thumbnail generation starts right before deleteAsync', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([]);

      let inFlightCallCount = 0;
      (getInFlightThumbnailPhotoPaths as jest.Mock).mockImplementation(() => {
        inFlightCallCount++;
        if (inFlightCallCount <= 2) {
          // 1st call: via getReferencedPhotoPaths during scan -> not in-flight
          // 2nd call: via getReferencedPhotoPaths during dbReferenced snapshot -> not in-flight
          return new Set<string>();
        }
        // 3rd call: getInFlightThumbnailProtectionSet() right before deleteAsync -> started!
        return new Set<string>(['file:///mock-documents/meal-A.jpg']);
      });

      setupMockFileSystem({
        'meal-A.jpg': { exists: true },
      });

      const cleanupResult = await cleanupOrphanedPhotoFiles();

      expect(cleanupResult.deletedFileNames).not.toContain('meal-A.jpg');
      expect(cleanupResult.skippedFileNames).toContain('meal-A.jpg');
      expect(mockFileSystem.has('meal-A.jpg')).toBe(true);
      expect(deleteAsync).not.toHaveBeenCalled();
    });

    test('Case E: does not delete photo or thumbnail of soft-deleted record', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        {
          id: 'meal-soft',
          photo_path: 'file:///mock-documents/meal-soft.jpg',
          photo_thumbnail_path: 'file:///mock-documents/meal-soft-thumb.jpg',
          is_deleted: 1,
        },
      ]);
      (getInFlightThumbnailPhotoPaths as jest.Mock).mockReturnValue(new Set<string>());

      setupMockFileSystem({
        'meal-soft.jpg': { exists: true },
        'meal-soft-thumb.jpg': { exists: true },
      });

      const cleanupResult = await cleanupOrphanedPhotoFiles();

      expect(cleanupResult.deletedFileNames).toEqual([]);
      expect(deleteAsync).not.toHaveBeenCalled();
      expect(mockFileSystem.has('meal-soft.jpg')).toBe(true);
      expect(mockFileSystem.has('meal-soft-thumb.jpg')).toBe(true);
    });

    test('Case F: options.referencedPaths stale snapshot does not bypass pre-delete DB check', async () => {
      // Scenario: caller passes an old referencedPaths that does NOT include meal-A.jpg,
      // but the real DB currently DOES reference meal-A.jpg.
      // The final latestReferenced check must use the real DB, not options.referencedPaths.
      const staleSnapshot = new Set<string>(); // does not contain meal-A.jpg

      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        {
          id: 'meal-1',
          photo_path: 'file:///mock-documents/meal-A.jpg',
          photo_thumbnail_path: null,
          is_deleted: 0,
        },
      ]);
      (getInFlightThumbnailPhotoPaths as jest.Mock).mockReturnValue(new Set<string>());

      setupMockFileSystem({
        'meal-A.jpg': { exists: true },
      });

      // Pass staleSnapshot as referencedPaths: scan treats meal-A.jpg as an orphan candidate,
      // but the pre-delete DB check MUST read the real DB and protect it.
      const cleanupResult = await cleanupOrphanedPhotoFiles({ referencedPaths: staleSnapshot });

      // meal-A.jpg is in the real DB -> must NOT be deleted
      expect(cleanupResult.deletedFileNames).not.toContain('meal-A.jpg');
      expect(deleteAsync).not.toHaveBeenCalledWith(
        'file:///mock-documents/meal-A.jpg',
        expect.anything()
      );
      expect(mockFileSystem.has('meal-A.jpg')).toBe(true);
      expect(cleanupResult.skippedFileNames).toContain('meal-A.jpg');
    });
  });

  describe('Path Safety & Boundary Invariants', () => {
    test('never deletes subdirectories or non-managed files in documentDirectory', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([]);
      setupMockFileSystem({
        'DiningMemory.db': { exists: true },
        'DiningMemory.db-wal': { exists: true },
        'manifest.json': { exists: true },
        'ai-models': { exists: true, isDirectory: true },
        'meal-pseudo-dir.jpg': { exists: true, isDirectory: true }, // Directory with image name
        'unrelated-document.pdf': { exists: true },
        'meal-genuine-orphan.jpg': { exists: true },
      });

      const cleanupResult = await cleanupOrphanedPhotoFiles();

      expect(cleanupResult.deletedFileNames).toEqual(['meal-genuine-orphan.jpg']);
      expect(mockFileSystem.has('DiningMemory.db')).toBe(true);
      expect(mockFileSystem.has('DiningMemory.db-wal')).toBe(true);
      expect(mockFileSystem.has('manifest.json')).toBe(true);
      expect(mockFileSystem.has('ai-models')).toBe(true);
      expect(mockFileSystem.has('meal-pseudo-dir.jpg')).toBe(true);
      expect(mockFileSystem.has('unrelated-document.pdf')).toBe(true);
      expect(mockFileSystem.has('meal-genuine-orphan.jpg')).toBe(false);
    });

    test('handles documentDirectory read or delete failures gracefully', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([]);
      (readDirectoryAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Permission denied or disk unreadable')
      );

      const result = await cleanupOrphanedPhotoFiles();
      expect(result.deletedFileNames).toHaveLength(0);
      expect(result.failedFileNames).toHaveLength(0);

      // Test delete failure handling
      setupMockFileSystem({
        'meal-orphan-fail.jpg': { exists: true },
      });
      (deleteAsync as jest.Mock).mockRejectedValueOnce(new Error('I/O error during delete'));

      const failResult = await cleanupOrphanedPhotoFiles();
      expect(failResult.deletedFileNames).toHaveLength(0);
      expect(failResult.failedFileNames).toEqual(['meal-orphan-fail.jpg']);
    });
  });
});
