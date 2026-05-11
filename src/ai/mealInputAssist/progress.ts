import type { MealInputAssistProgress, MealInputAssistProgressUpdate } from './types';

export function toProgressSnapshot(
  update: MealInputAssistProgressUpdate,
  startedAt: number,
  updatedAt: number
): MealInputAssistProgress {
  const now = Date.now();
  const elapsedMs = Math.max(now - startedAt, 0);
  const estimatedRemainingMs =
    update.estimatedRemainingMs === null
      ? null
      : Math.max(update.estimatedRemainingMs - (now - updatedAt), 0);

  return {
    ...update,
    elapsedMs,
    estimatedRemainingMs,
  };
}
