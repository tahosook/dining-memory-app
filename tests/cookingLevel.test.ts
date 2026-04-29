import { formatCookingLevel, inferCookingLevel, normalizeCookingLevel } from '../src/utils/cookingLevel';

describe('cookingLevel utilities', () => {
  test('formats current homemade style values', () => {
    expect(formatCookingLevel('quick')).toBe('時短');
    expect(formatCookingLevel('daily')).toBe('日常');
    expect(formatCookingLevel('gourmet')).toBe('本格');
  });

  test('normalizes legacy cooking level values', () => {
    expect(normalizeCookingLevel('easy')).toBe('quick');
    expect(formatCookingLevel('easy')).toBe('時短');
    expect(normalizeCookingLevel('medium')).toBe('daily');
    expect(formatCookingLevel('medium')).toBe('日常');
    expect(normalizeCookingLevel('hard')).toBe('gourmet');
    expect(formatCookingLevel('hard')).toBe('本格');
  });

  test('infers homemade style from meal text', () => {
    expect(inferCookingLevel({ mealName: '納豆ご飯', isHomemade: true })).toBe('quick');
    expect(inferCookingLevel({ mealName: 'カレー', isHomemade: true })).toBe('daily');
    expect(inferCookingLevel({ mealName: 'ローストビーフ', isHomemade: true })).toBe('gourmet');
    expect(inferCookingLevel({ mealName: 'カレー', isHomemade: false })).toBeUndefined();
  });
});
