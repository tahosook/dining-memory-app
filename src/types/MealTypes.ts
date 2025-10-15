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

export interface Ingredient {
  id: string;
  meal_id: string;
  name: string;
  category?: string;
  confidence?: number;
  quantity?: string;
  ingredient_type?: string;
  is_user_added: boolean;
  created_at: number;
}

export interface Location {
  id: string;
  name: string;
  category?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  visit_count: number;
  last_visit?: number;
  first_visit?: number;
  average_interval_days?: number;
  business_hours?: string;
  price_range?: PriceRange;
  is_favorite: boolean;
  notes?: string;
  created_at: number;
}

export interface MealImage {
  id: string;
  meal_id: string;
  original_path: string;
  thumbnail_path?: string;
  compressed_path?: string;
  file_size?: number;
  width?: number;
  height?: number;
  format?: string;
  taken_at?: number;
  camera_make?: string;
  camera_model?: string;
  is_processed: boolean;
  processing_status?: ProcessingStatus;
  quality_score?: number;
}

export interface CookingPattern {
  id: string;
  meal_id: string;
  recipe_complexity?: number;
  cooking_time_minutes?: number;
  skill_level?: SkillLevel;
  ingredient_count?: number;
  fresh_ingredient_ratio?: number;
  day_of_week?: DayOfWeek;
  time_of_day?: TimeOfDay;
  weather_condition?: string;
  created_at: number;
  analysis_version?: string;
}

export interface Tag {
  id: string;
  name: string;
  category?: string;
  color?: string;
  usage_count: number;
  is_system_tag: boolean;
  created_at: number;
}

export interface MealTag {
  id: string;
  meal_id: string;
  tag_id: string;
  confidence?: number;
  created_at: number;
}

export interface BehaviorInsight {
  id: string;
  insight_type: InsightType;
  title: string;
  description?: string;
  confidence: number;
  analysis_start_date?: number;
  analysis_end_date?: number;
  related_meals?: string;
  statistical_data?: string;
  discovered_at: number;
  is_dismissed: boolean;
  shown_to_user: boolean;
  business_relevance?: number;
  health_relevance?: number;
  lifestyle_relevance?: number;
}

export interface SearchVector {
  id: string;
  meal_id: string;
  vector_data?: string;
  vector_model?: string;
  vector_dimension?: number;
  indexed_text?: string;
  keywords?: string;
  created_at: number;
  updated_at: number;
}

export interface AppSetting {
  id: string;
  key: string;
  value?: string;
  data_type?: string;
  updated_at: number;
  description?: string;
  is_user_setting: boolean;
  requires_restart: boolean;
}

// Union Types
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type CookingLevel = 'easy' | 'medium' | 'hard';

export type PriceRange = 'low' | 'medium' | 'high';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export type InsightType = 'pattern' | 'trend' | 'recommendation' | 'warning' | 'insight';

// Input types for creating records
export type MealInput = Partial<Omit<Meal, 'id' | 'created_at' | 'updated_at'>>;

export type IngredientInput = Partial<Omit<Ingredient, 'id' | 'created_at'>>;

export type LocationInput = Partial<Omit<Location, 'id' | 'created_at'>>;

export type TagInput = Partial<Omit<Tag, 'id' | 'created_at' | 'usage_count'>>;
