export interface MealRecord {
  id: string;
  uuid: string;
  meal_name: string;
  meal_type?: string;
  cuisine_type?: string;
  is_homemade: boolean;
  photo_path?: string;
  photo_thumbnail_path?: string;
  location_name?: string;
  meal_datetime: number;
  notes?: string;
  cooking_level?: string;
}
