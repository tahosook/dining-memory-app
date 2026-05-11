import type { AppliedMealInputAssistMetadata } from './types';

export function mergeAppliedMetadata(
  current: AppliedMealInputAssistMetadata | null,
  field: AppliedMealInputAssistMetadata['appliedFields'][number],
  source: string,
  confidence?: number
): AppliedMealInputAssistMetadata {
  const appliedFields = current?.appliedFields.includes(field)
    ? current.appliedFields
    : [...(current?.appliedFields ?? []), field];

  const nextConfidence =
    typeof confidence === 'number'
      ? typeof current?.aiConfidence === 'number'
        ? Math.max(current.aiConfidence, confidence)
        : confidence
      : current?.aiConfidence;

  return {
    aiSource: source,
    aiConfidence: nextConfidence,
    appliedFields,
  };
}
