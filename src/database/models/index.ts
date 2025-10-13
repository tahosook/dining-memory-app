// Simplified database models to avoid TypeScript compatibility issues
import { Model, Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'

// Simple minimal model classes for basic functionality
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

// Database setup - Platform-specific initialization
import { Platform } from 'react-native';

export const database = Platform.OS === 'web' ? null : null; // Disable SQLite for now

// Platform-specific database setup - Mock for all platforms initially
console.log('Platform detected:', Platform.OS);
console.log('Using mock database for initial testing');

// Mock database functions for initial testing
(global as any).database = {
  get: (table: string) => ({
    query: () => ({
      fetch: () => Promise.resolve([]),
      extend: () => ({
        fetch: () => Promise.resolve([])
      })
    }),
    create: (callback: Function) => ({ then: () => Promise.resolve({}) }),
    find: (id: string) => Promise.resolve({}),
    write: (callback: Function) => Promise.resolve(callback())
  }),
  write: (callback: Function) => Promise.resolve(callback()),
  collections: {}
};
