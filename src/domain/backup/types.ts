export interface BackupManifest {
  formatVersion: number;
  appId: string;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string; // ISO 8601 string
  mealCount: number;
  photoCount: number;
}

export interface PortableMealRecord {
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
  photo_file_name: string;
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

export interface PortableAppSettingRecord {
  key: string;
  value?: string | null;
  updated_at: number;
}

export interface BackupValidationResult {
  valid: boolean;
  manifest?: BackupManifest;
  meals?: PortableMealRecord[];
  appSettings?: PortableAppSettingRecord[];
  photoFileNames?: string[];
  stagingDirectory?: string;
  error?: string;
}
