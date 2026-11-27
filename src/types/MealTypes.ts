export interface Meal {
  id: string;
  uuid: string;
  meal_name: string;
  meal_type?: MealType;
  cuisine_type?: string;
  ai_confidence?: number;
  ai_source?: string;
  notes?: string;
  cooking_level?: CookingLevel;
  is_homemade: boolean;
  photo_path: string;
  photo_thumbnail_path?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  meal_datetime: number;
  search_text?: string;
  tags?: string;
  is_deleted: boolean;
  created_at: number;
  updated_at: number;
}

// Union Types
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type CookingLevel = 'quick' | 'daily' | 'gourmet';
