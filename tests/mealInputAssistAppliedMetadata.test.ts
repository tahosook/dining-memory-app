import { mergeAppliedMetadata } from '../src/ai/mealInputAssist/appliedMetadata';
import type { AppliedMealInputAssistMetadata } from '../src/ai/mealInputAssist/types';

describe('mergeAppliedMetadata', () => {
  it('creates new metadata when current is null', () => {
    const result = mergeAppliedMetadata(null, 'mealName', 'source_a', 0.9);
    expect(result).toEqual({
      aiSource: 'source_a',
      aiConfidence: 0.9,
      appliedFields: ['mealName'],
    });
  });

  it('creates new metadata when current is null and confidence is omitted', () => {
    const result = mergeAppliedMetadata(null, 'mealName', 'source_a');
    expect(result).toEqual({
      aiSource: 'source_a',
      aiConfidence: undefined,
      appliedFields: ['mealName'],
    });
  });

  it('adds a new field to existing metadata', () => {
    const current: AppliedMealInputAssistMetadata = {
      aiSource: 'source_a',
      aiConfidence: 0.8,
      appliedFields: ['mealName'],
    };
    const result = mergeAppliedMetadata(current, 'cuisineType', 'source_b', 0.5);
    expect(result).toEqual({
      aiSource: 'source_b',
      aiConfidence: 0.8, // 0.8 > 0.5, keeps max
      appliedFields: ['mealName', 'cuisineType'],
    });
  });

  it('deduplicates an already applied field', () => {
    const current: AppliedMealInputAssistMetadata = {
      aiSource: 'source_a',
      aiConfidence: 0.8,
      appliedFields: ['mealName'],
    };
    const result = mergeAppliedMetadata(current, 'mealName', 'source_b', 0.95);
    expect(result).toEqual({
      aiSource: 'source_b',
      aiConfidence: 0.95, // 0.95 > 0.8, updates max
      appliedFields: ['mealName'],
    });
  });

  it('handles missing current confidence with new confidence provided', () => {
    const current: AppliedMealInputAssistMetadata = {
      aiSource: 'source_a',
      appliedFields: ['mealName'],
    };
    const result = mergeAppliedMetadata(current, 'cuisineType', 'source_b', 0.7);
    expect(result).toEqual({
      aiSource: 'source_b',
      aiConfidence: 0.7,
      appliedFields: ['mealName', 'cuisineType'],
    });
  });

  it('handles current confidence with missing new confidence', () => {
    const current: AppliedMealInputAssistMetadata = {
      aiSource: 'source_a',
      aiConfidence: 0.8,
      appliedFields: ['mealName'],
    };
    const result = mergeAppliedMetadata(current, 'cuisineType', 'source_b');
    expect(result).toEqual({
      aiSource: 'source_b',
      aiConfidence: 0.8,
      appliedFields: ['mealName', 'cuisineType'],
    });
  });
});
