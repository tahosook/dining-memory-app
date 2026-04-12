import { Model } from '@nozbe/watermelondb';
import { initializeDatabase } from '../services/localDatabase';

export class Meal extends Model {
  static table = 'meals';
}

export class Ingredient extends Model {
  static table = 'ingredients';
}

export class Location extends Model {
  static table = 'locations';
}

export class MealImage extends Model {
  static table = 'meal_images';
}

export class CookingPattern extends Model {
  static table = 'cooking_patterns';
}

export class Tag extends Model {
  static table = 'tags';
}

export class MealTag extends Model {
  static table = 'meal_tags';
}

export class BehaviorInsight extends Model {
  static table = 'behavior_insights';
}

export class SearchVector extends Model {
  static table = 'search_vectors';
}

export class AppSetting extends Model {
  static table = 'app_settings';
}

export const database = {
  initialize: initializeDatabase,
};

export default database;
