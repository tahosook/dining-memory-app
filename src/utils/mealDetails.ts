export type MealDetailMessageInput = {
  meal_datetime: number;
  location_name?: string;
  cuisine_type?: string;
  is_homemade: boolean;
  notes?: string;
};

export function formatMealDetailMessage(meal: MealDetailMessageInput): string {
  const lines = [
    `撮影日時: ${new Date(meal.meal_datetime).toLocaleString('ja-JP')}`,
    meal.location_name ? `場所: ${meal.location_name}` : null,
    meal.cuisine_type ? `料理ジャンル: ${meal.cuisine_type}` : null,
    meal.is_homemade ? '自炊' : '外食',
    meal.notes ? `メモ: ${meal.notes}` : null,
  ];

  return lines.filter(Boolean).join('\n');
}
