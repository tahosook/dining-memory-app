import { appSchema, tableSchema } from '@nozbe/watermelondb'

// Define the app schema
const appSchemaDefinition = appSchema({
  version: 1,
  tables: [
    // Meals table
    tableSchema({
      name: 'meals',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'meal_name', type: 'string', isIndexed: true },
        { name: 'meal_type', type: 'string', isOptional: true },
        { name: 'cuisine_type', type: 'string', isOptional: true, isIndexed: true },
        { name: 'ai_confidence', type: 'number', isOptional: true },
        { name: 'ai_source', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'cooking_level', type: 'string', isOptional: true },
        { name: 'is_homemade', type: 'boolean', isIndexed: true },
        { name: 'photo_path', type: 'string' },
        { name: 'photo_thumbnail_path', type: 'string', isOptional: true },
        { name: 'location_name', type: 'string', isOptional: true, isIndexed: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'meal_datetime', type: 'number', isIndexed: true },
        { name: 'search_text', type: 'string', isOptional: true },
        { name: 'tags', type: 'string', isOptional: true },
        { name: 'is_deleted', type: 'boolean', isIndexed: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' }
      ]
    }),

    // Ingredients table
    tableSchema({
      name: 'ingredients',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'confidence', type: 'number', isOptional: true },
        { name: 'quantity', type: 'string', isOptional: true },
        { name: 'ingredient_type', type: 'string', isOptional: true },
        { name: 'is_user_added', type: 'boolean' },
        { name: 'created_at', type: 'number' }
      ]
    }),

    // Locations table
    tableSchema({
      name: 'locations',
      columns: [
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'visit_count', type: 'number', isIndexed: true },
        { name: 'last_visit', type: 'number', isOptional: true },
        { name: 'first_visit', type: 'number', isOptional: true },
        { name: 'average_interval_days', type: 'number', isOptional: true },
        { name: 'business_hours', type: 'string', isOptional: true },
        { name: 'price_range', type: 'string', isOptional: true },
        { name: 'is_favorite', type: 'boolean', isIndexed: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' }
      ]
    }),

    // Meal images table
    tableSchema({
      name: 'meal_images',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'original_path', type: 'string' },
        { name: 'thumbnail_path', type: 'string', isOptional: true },
        { name: 'compressed_path', type: 'string', isOptional: true },
        { name: 'file_size', type: 'number', isOptional: true },
        { name: 'width', type: 'number', isOptional: true },
        { name: 'height', type: 'number', isOptional: true },
        { name: 'format', type: 'string', isOptional: true },
        { name: 'taken_at', type: 'number', isOptional: true },
        { name: 'camera_make', type: 'string', isOptional: true },
        { name: 'camera_model', type: 'string', isOptional: true },
        { name: 'is_processed', type: 'boolean' },
        { name: 'processing_status', type: 'string', isOptional: true },
        { name: 'quality_score', type: 'number', isOptional: true }
      ]
    }),

    // Cooking patterns table
    tableSchema({
      name: 'cooking_patterns',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'recipe_complexity', type: 'number', isOptional: true },
        { name: 'cooking_time_minutes', type: 'number', isOptional: true },
        { name: 'skill_level', type: 'string', isOptional: true },
        { name: 'ingredient_count', type: 'number', isOptional: true },
        { name: 'fresh_ingredient_ratio', type: 'number', isOptional: true },
        { name: 'day_of_week', type: 'number', isOptional: true },
        { name: 'time_of_day', type: 'string', isOptional: true },
        { name: 'weather_condition', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'analysis_version', type: 'string', isOptional: true }
      ]
    }),

    // Tags table
    tableSchema({
      name: 'tags',
      columns: [
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'color', type: 'string', isOptional: true },
        { name: 'usage_count', type: 'number', isIndexed: true },
        { name: 'is_system_tag', type: 'boolean' },
        { name: 'created_at', type: 'number' }
      ]
    }),

    // Meal-tags junction table
    tableSchema({
      name: 'meal_tags',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'tag_id', type: 'string', isIndexed: true },
        { name: 'confidence', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' }
      ]
    }),

    // Behavior insights table
    tableSchema({
      name: 'behavior_insights',
      columns: [
        { name: 'insight_type', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'confidence', type: 'number' },
        { name: 'analysis_start_date', type: 'number', isOptional: true },
        { name: 'analysis_end_date', type: 'number', isOptional: true },
        { name: 'related_meals', type: 'string', isOptional: true },
        { name: 'statistical_data', type: 'string', isOptional: true },
        { name: 'discovered_at', type: 'number' },
        { name: 'is_dismissed', type: 'boolean', isIndexed: true },
        { name: 'shown_to_user', type: 'boolean', isIndexed: true },
        { name: 'business_relevance', type: 'number', isOptional: true },
        { name: 'health_relevance', type: 'number', isOptional: true },
        { name: 'lifestyle_relevance', type: 'number', isOptional: true }
      ]
    }),

    // Search vectors table
    tableSchema({
      name: 'search_vectors',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'vector_data', type: 'string', isOptional: true },
        { name: 'vector_model', type: 'string', isOptional: true },
        { name: 'vector_dimension', type: 'number', isOptional: true },
        { name: 'indexed_text', type: 'string', isOptional: true },
        { name: 'keywords', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' }
      ]
    }),

    // App settings table
    tableSchema({
      name: 'app_settings',
      columns: [
        { name: 'key', type: 'string', isIndexed: true },
        { name: 'value', type: 'string', isOptional: true },
        { name: 'data_type', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'is_user_setting', type: 'boolean' },
        { name: 'requires_restart', type: 'boolean' }
      ]
    })
  ]
})

export default appSchemaDefinition
