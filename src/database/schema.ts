import { appSchema, tableSchema } from '@nozbe/watermelondb'

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'meals',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'meal_name', type: 'string' },
        { name: 'meal_type', type: 'string' },
        { name: 'cuisine_type', type: 'string' },
        { name: 'ai_confidence', type: 'number' },
        { name: 'ai_source', type: 'string' },
        { name: 'notes', type: 'string' },
        { name: 'cooking_level', type: 'string' },
        { name: 'is_homemade', type: 'boolean' },
        { name: 'photo_path', type: 'string' },
        { name: 'photo_thumbnail_path', type: 'string' },
        { name: 'location_name', type: 'string' },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'meal_datetime', type: 'number', isIndexed: true },
        { name: 'search_text', type: 'string' },
        { name: 'tags', type: 'string' },
        { name: 'is_deleted', type: 'boolean', isIndexed: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'ingredients',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string' },
        { name: 'confidence', type: 'number' },
        { name: 'quantity', type: 'string' },
        { name: 'ingredient_type', type: 'string' },
        { name: 'is_user_added', type: 'boolean' },
        { name: 'created_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'locations',
      columns: [
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'category', type: 'string' },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'address', type: 'string' },
        { name: 'visit_count', type: 'number' },
        { name: 'last_visit', type: 'number' },
        { name: 'first_visit', type: 'number' },
        { name: 'average_interval_days', type: 'number' },
        { name: 'business_hours', type: 'string' },
        { name: 'price_range', type: 'string' },
        { name: 'is_favorite', type: 'boolean' },
        { name: 'notes', type: 'string' },
        { name: 'created_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'meal_images',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'original_path', type: 'string' },
        { name: 'thumbnail_path', type: 'string' },
        { name: 'compressed_path', type: 'string' },
        { name: 'file_size', type: 'number' },
        { name: 'width', type: 'number' },
        { name: 'height', type: 'number' },
        { name: 'format', type: 'string' },
        { name: 'taken_at', type: 'number' },
        { name: 'camera_make', type: 'string' },
        { name: 'camera_model', type: 'string' },
        { name: 'is_processed', type: 'boolean' },
        { name: 'processing_status', type: 'string' },
        { name: 'quality_score', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'cooking_patterns',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'recipe_complexity', type: 'number' },
        { name: 'cooking_time_minutes', type: 'number' },
        { name: 'skill_level', type: 'string' },
        { name: 'ingredient_count', type: 'number' },
        { name: 'fresh_ingredient_ratio', type: 'number' },
        { name: 'day_of_week', type: 'number' },
        { name: 'time_of_day', type: 'string' },
        { name: 'weather_condition', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'analysis_version', type: 'string' },
      ]
    }),
    tableSchema({
      name: 'tags',
      columns: [
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'category', type: 'string' },
        { name: 'color', type: 'string' },
        { name: 'usage_count', type: 'number' },
        { name: 'is_system_tag', type: 'boolean' },
        { name: 'created_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'meal_tags',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'tag_id', type: 'string', isIndexed: true },
        { name: 'confidence', type: 'number' },
        { name: 'created_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'behavior_insights',
      columns: [
        { name: 'insight_type', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'confidence', type: 'number' },
        { name: 'analysis_start_date', type: 'number' },
        { name: 'analysis_end_date', type: 'number' },
        { name: 'related_meals', type: 'string' },
        { name: 'statistical_data', type: 'string' },
        { name: 'discovered_at', type: 'number' },
        { name: 'is_dismissed', type: 'boolean' },
        { name: 'shown_to_user', type: 'boolean' },
        { name: 'business_relevance', type: 'number' },
        { name: 'health_relevance', type: 'number' },
        { name: 'lifestyle_relevance', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'search_vectors',
      columns: [
        { name: 'meal_id', type: 'string', isIndexed: true },
        { name: 'vector_data', type: 'string' },
        { name: 'vector_model', type: 'string' },
        { name: 'vector_dimension', type: 'number' },
        { name: 'indexed_text', type: 'string' },
        { name: 'keywords', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'app_settings',
      columns: [
        { name: 'key', type: 'string', isIndexed: true },
        { name: 'value', type: 'string' },
        { name: 'data_type', type: 'string' },
        { name: 'updated_at', type: 'number' },
        { name: 'description', type: 'string' },
        { name: 'is_user_setting', type: 'boolean' },
        { name: 'requires_restart', type: 'boolean' },
      ]
    }),
  ]
})
