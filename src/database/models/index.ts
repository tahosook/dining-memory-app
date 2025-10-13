import { Model, field, children, Relation, Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'

// Types for type safety
export interface MealType {
  uuid: string;
  meal_name: string;
  meal_type?: string;
  cuisine_type?: string;
  ai_confidence?: number;
  ai_source?: string;
  notes?: string;
  cooking_level?: string;
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

// Model classes
export class Meal extends Model {
  static table = 'meals'

  @field('uuid') uuid!: string
  @field('meal_name') meal_name!: string
  @field('meal_type') meal_type?: string
  @field('cuisine_type') cuisine_type?: string
  @field('ai_confidence') ai_confidence?: number
  @field('ai_source') ai_source?: string
  @field('notes') notes?: string
  @field('cooking_level') cooking_level?: string
  @field('is_homemade') is_homemade!: boolean
  @field('photo_path') photo_path!: string
  @field('photo_thumbnail_path') photo_thumbnail_path?: string
  @field('location_name') location_name?: string
  @field('latitude') latitude?: number
  @field('longitude') longitude?: number
  @field('meal_datetime') meal_datetime!: number
  @field('search_text') search_text?: string
  @field('tags') tags?: string
  @field('is_deleted') is_deleted!: boolean
  @field('created_at') created_at!: number
  @field('updated_at') updated_at!: number

  // Relationships
  @children('ingredients') ingredients
  @children('meal_images') images
  @children('cooking_patterns') cooking_patterns
  @children('meal_tags') meal_tags
  @children('search_vectors') search_vectors
}

export class Ingredient extends Model {
  static table = 'ingredients'

  @field('meal_id') meal_id!: string
  @field('name') name!: string
  @field('category') category?: string
  @field('confidence') confidence?: number
  @field('quantity') quantity?: string
  @field('ingredient_type') ingredient_type?: string
  @field('is_user_added') is_user_added!: boolean
  @field('created_at') created_at!: number

  // Relationships - will be added after basic setup
  // @relation('meals', 'meal_id') meal
}

export class Location extends Model {
  static table = 'locations'

  @field('name') name!: string
  @field('category') category?: string
  @field('latitude') latitude?: number
  @field('longitude') longitude?: number
  @field('address') address?: string
  @field('visit_count') visit_count!: number
  @field('last_visit') last_visit?: number
  @field('first_visit') first_visit?: number
  @field('average_interval_days') average_interval_days?: number
  @field('business_hours') business_hours?: string
  @field('price_range') price_range?: string
  @field('is_favorite') is_favorite!: boolean
  @field('notes') notes?: string
  @field('created_at') created_at!: number
}

export class MealImage extends Model {
  static table = 'meal_images'

  @field('meal_id') meal_id!: string
  @field('original_path') original_path!: string
  @field('thumbnail_path') thumbnail_path?: string
  @field('compressed_path') compressed_path?: string
  @field('file_size') file_size?: number
  @field('width') width?: number
  @field('height') height?: number
  @field('format') format?: string
  @field('taken_at') taken_at?: number
  @field('camera_make') camera_make?: string
  @field('camera_model') camera_model?: string
  @field('is_processed') is_processed!: boolean
  @field('processing_status') processing_status?: string
  @field('quality_score') quality_score?: number

  // Relationships - will be added after basic setup
  // @relation('meals', 'meal_id') meal
}

export class CookingPattern extends Model {
  static table = 'cooking_patterns'

  @field('meal_id') meal_id!: string
  @field('recipe_complexity') recipe_complexity?: number
  @field('cooking_time_minutes') cooking_time_minutes?: number
  @field('skill_level') skill_level?: string
  @field('ingredient_count') ingredient_count?: number
  @field('fresh_ingredient_ratio') fresh_ingredient_ratio?: number
  @field('day_of_week') day_of_week?: number
  @field('time_of_day') time_of_day?: string
  @field('weather_condition') weather_condition?: string
  @field('created_at') created_at!: number
  @field('analysis_version') analysis_version?: string

  // Relationships - will be added after basic setup
  // @relation('meals', 'meal_id') meal
}

export class Tag extends Model {
  static table = 'tags'

  @field('name') name!: string
  @field('category') category?: string
  @field('color') color?: string
  @field('usage_count') usage_count!: number
  @field('is_system_tag') is_system_tag!: boolean
  @field('created_at') created_at!: number

  // Relationships
  @children('meal_tags') meal_tags
}

export class MealTag extends Model {
  static table = 'meal_tags'

  @field('meal_id') meal_id!: string
  @field('tag_id') tag_id!: string
  @field('confidence') confidence?: number
  @field('created_at') created_at!: number

  // Relationships - will be added after basic setup
  // @relation('meals', 'meal_id') meal
  // @relation('tags', 'tag_id') tag
}

export class BehaviorInsight extends Model {
  static table = 'behavior_insights'

  @field('insight_type') insight_type!: string
  @field('title') title!: string
  @field('description') description?: string
  @field('confidence') confidence!: number
  @field('analysis_start_date') analysis_start_date?: number
  @field('analysis_end_date') analysis_end_date?: number
  @field('related_meals') related_meals?: string
  @field('statistical_data') statistical_data?: string
  @field('discovered_at') discovered_at!: number
  @field('is_dismissed') is_dismissed!: boolean
  @field('shown_to_user') shown_to_user!: boolean
  @field('business_relevance') business_relevance?: number
  @field('health_relevance') health_relevance?: number
  @field('lifestyle_relevance') lifestyle_relevance?: number
}

export class SearchVector extends Model {
  static table = 'search_vectors'

  @field('meal_id') meal_id!: string
  @field('vector_data') vector_data?: string
  @field('vector_model') vector_model?: string
  @field('vector_dimension') vector_dimension?: number
  @field('indexed_text') indexed_text?: string
  @field('keywords') keywords?: string
  @field('created_at') created_at!: number
  @field('updated_at') updated_at!: number

}

export class AppSetting extends Model {
  static table = 'app_settings'

  @field('key') key!: string
  @field('value') value?: string
  @field('data_type') data_type?: string
  @field('updated_at') updated_at!: number
  @field('description') description?: string
  @field('is_user_setting') is_user_setting!: boolean
  @field('requires_restart') requires_restart!: boolean
}

// Database setup
import schema from './schema'

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'DiningMemoryDB',
})

export const database = new Database({
  adapter,
  modelClasses: [
    Meal,
    Ingredient,
    Location,
    MealImage,
    CookingPattern,
    Tag,
    MealTag,
    BehaviorInsight,
    SearchVector,
    AppSetting,
  ],
})
