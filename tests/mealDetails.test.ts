import { formatMealDetailMessage } from '../src/utils/mealDetails';

describe('formatMealDetailMessage', () => {
  const mockDatetime = new Date('2023-10-15T12:30:00Z').getTime();

  it('formats a complete meal detail message', () => {
    const input = {
      meal_datetime: mockDatetime,
      location_name: 'My Favorite Restaurant',
      cuisine_type: 'Italian',
      is_homemade: false,
      notes: 'Delicious pasta!',
    };

    const result = formatMealDetailMessage(input);
    const expectedTimeStr = new Date(mockDatetime).toLocaleString('ja-JP');

    expect(result).toBe(
      `撮影日時: ${expectedTimeStr}\n場所: My Favorite Restaurant\n料理ジャンル: Italian\n外食\nメモ: Delicious pasta!`
    );
  });

  it('formats a minimal meal detail message (homemade)', () => {
    const input = {
      meal_datetime: mockDatetime,
      is_homemade: true,
    };

    const result = formatMealDetailMessage(input);
    const expectedTimeStr = new Date(mockDatetime).toLocaleString('ja-JP');

    expect(result).toBe(`撮影日時: ${expectedTimeStr}\n自炊`);
  });

  it('formats a minimal meal detail message (eating out)', () => {
    const input = {
      meal_datetime: mockDatetime,
      is_homemade: false,
    };

    const result = formatMealDetailMessage(input);
    const expectedTimeStr = new Date(mockDatetime).toLocaleString('ja-JP');

    expect(result).toBe(`撮影日時: ${expectedTimeStr}\n外食`);
  });

  it('omits falsy optional fields correctly', () => {
    const input = {
      meal_datetime: mockDatetime,
      location_name: '', // Empty string should be omitted
      cuisine_type: undefined,
      is_homemade: true,
      notes: null as any,
    };

    const result = formatMealDetailMessage(input);
    const expectedTimeStr = new Date(mockDatetime).toLocaleString('ja-JP');

    expect(result).toBe(`撮影日時: ${expectedTimeStr}\n自炊`);
  });
});
