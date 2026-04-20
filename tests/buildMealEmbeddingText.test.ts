import {
  buildMealEmbeddingText,
  MEAL_EMBEDDING_TEXT_VERSION,
} from '../src/ai/search/buildMealEmbeddingText';

describe('buildMealEmbeddingText', () => {
  test('uses only the semantic-search fields in a stable order', () => {
    const text = buildMealEmbeddingText({
      meal_name: '  親子丼  ',
      cuisine_type: ' 和食 ',
      location_name: ' 自宅 ',
      notes: '  夕食 でした ',
      tags: '卵, 鶏肉',
    });

    expect(text).toBe('親子丼\n和食\n自宅\n夕食 でした\n卵, 鶏肉');
  });

  test('skips empty fields without falling back to search_text', () => {
    const text = buildMealEmbeddingText({
      meal_name: 'ラーメン',
      cuisine_type: '',
      location_name: undefined,
      notes: '  ',
      tags: '夜',
    });

    expect(text).toBe('ラーメン\n夜');
    expect(MEAL_EMBEDDING_TEXT_VERSION).toBe(1);
  });
});
