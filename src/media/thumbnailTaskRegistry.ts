/**
 * Dependency-free registry tracking in-flight thumbnail generation photo paths.
 *
 * Kept separate from `mealThumbnail.ts` and `photoLifecycle.ts` to avoid a circular
 * dependency between `src/media/` and `src/database/services/MealService.ts`.
 */

const inFlightGenerationPhotoPaths = new Map<string, string>();

export function registerInFlightThumbnailGeneration(
  generationKey: string,
  photoPath: string
): void {
  if (photoPath) {
    inFlightGenerationPhotoPaths.set(generationKey, photoPath);
  }
}

export function unregisterInFlightThumbnailGeneration(generationKey: string): void {
  inFlightGenerationPhotoPaths.delete(generationKey);
}

export function getInFlightThumbnailPhotoPaths(): Set<string> {
  return new Set(inFlightGenerationPhotoPaths.values());
}

export function clearInFlightThumbnailRegistry(): void {
  inFlightGenerationPhotoPaths.clear();
}
