export interface PersistedMealRow {
  id: string;
  uuid: string;
  meal_name: string;
  meal_type?: string | null;
  cuisine_type?: string | null;
  ai_confidence?: number | null;
  ai_source?: string | null;
  notes?: string | null;
  cooking_level?: string | null;
  is_homemade: number;
  photo_path: string;
  photo_thumbnail_path?: string | null;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  meal_datetime: number;
  search_text?: string | null;
  tags?: string | null;
  is_deleted: number;
  created_at: number;
  updated_at: number;
}

export interface PersistedAppSettingRow {
  key: string;
  value?: string | null;
  updated_at: number;
}
