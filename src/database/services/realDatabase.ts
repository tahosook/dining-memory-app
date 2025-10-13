// Real database implementation for native platforms
import { Model, Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'

// Model classes for native platforms
export class Meal extends Model {
  static table = 'meals'
}

export class Ingredient extends Model {
  static table = 'ingredients'
}

export class Location extends Model {
  static table = 'locations'
}

export class MealImage extends Model {
  static table = 'meal_images'
}

export class CookingPattern extends Model {
  static table = 'cooking_patterns'
}

export class Tag extends Model {
  static table = 'tags'
}

export class MealTag extends Model {
  static table = 'meal_tags'
}

export class BehaviorInsight extends Model {
  static table = 'behavior_insights'
}

export class SearchVector extends Model {
  static table = 'search_vectors'
}

export class AppSetting extends Model {
  static table = 'app_settings'
}

// Database setup for native platforms
import schema from '../models/schema'

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'DiningMemoryDB',
})

export const realDatabase = new Database({
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

// Schema version for migrations
export const SCHEMA_VERSION = 1;

// Default export for schema
export default schema
