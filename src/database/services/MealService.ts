import { database } from '../models'
import { Q } from '@nozbe/watermelondb'

export interface CreateMealData {
  meal_name: string
  meal_type?: string
  cuisine_type?: string
  ai_confidence?: number
  ai_source?: string
  notes?: string
  cooking_level?: string
  is_homemade: boolean
  photo_path: string
  photo_thumbnail_path?: string
  location_name?: string
  latitude?: number
  longitude?: number
  meal_datetime: Date
  search_text?: string
  ingredients?: Array<{name: string, category?: string, confidence?: number, quantity?: string, ingredient_type?: string}>
  cooking_pattern?: {
    recipe_complexity?: number
    cooking_time_minutes?: number
    skill_level?: string
    ingredient_count?: number
    fresh_ingredient_ratio?: number
    day_of_week?: number
    time_of_day?: string
  }
}

export interface SearchFilters {
  dateFrom?: Date
  dateTo?: Date
  cuisine_type?: string
  is_homemade?: boolean
  cooking_level?: string
  location_name?: string
  text?: string
}

export class MealService {
  // Create a new meal record
  static async createMeal(data: CreateMealData): Promise<any> {
    return await database.write(async () => {
      const meal = await database.get('meals').create((record: any) => {
        record.uuid = `meal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        record.meal_name = data.meal_name
        record.meal_type = data.meal_type
        record.cuisine_type = data.cuisine_type
        record.ai_confidence = data.ai_confidence
        record.ai_source = data.ai_source
        record.notes = data.notes
        record.cooking_level = data.cooking_level
        record.is_homemade = data.is_homemade
        record.photo_path = data.photo_path
        record.photo_thumbnail_path = data.photo_thumbnail_path
        record.location_name = data.location_name
        record.latitude = data.latitude
        record.longitude = data.longitude
        record.meal_datetime = data.meal_datetime.getTime()
        record.search_text = data.search_text || this.generateSearchText(data)
        record.is_deleted = false
        record.created_at = Date.now()
        record.updated_at = Date.now()
      })

      // Create ingredients if provided
      if (data.ingredients && data.ingredients.length > 0) {
        for (const ingredientData of data.ingredients) {
          await database.get('ingredients').create((record: any) => {
            record.meal_id = meal.id
            record.name = ingredientData.name
            record.category = ingredientData.category
            record.confidence = ingredientData.confidence
            record.quantity = ingredientData.quantity
            record.ingredient_type = ingredientData.ingredient_type
            record.is_user_added = false
            record.created_at = Date.now()
          })
        }
      }

      // Create cooking pattern if provided
      if (data.cooking_pattern) {
        await database.get('cooking_patterns').create((record: any) => {
          record.meal_id = meal.id
          record.recipe_complexity = data.cooking_pattern?.recipe_complexity
          record.cooking_time_minutes = data.cooking_pattern?.cooking_time_minutes
          record.skill_level = data.cooking_pattern?.skill_level
          record.ingredient_count = data.cooking_pattern?.ingredient_count
          record.fresh_ingredient_ratio = data.cooking_pattern?.fresh_ingredient_ratio
          record.day_of_week = data.cooking_pattern?.day_of_week
          record.time_of_day = data.cooking_pattern?.time_of_day
          record.weather_condition = null // Will be added later
          record.created_at = Date.now()
          record.analysis_version = '1.0'
        })
      }

      return meal
    })
  }

  // Search meals with filters
  static async searchMeals(query: SearchFilters = {}): Promise<any[]> {
    const collection = database.get('meals')
    let queryBuilder = collection.query(Q.where('is_deleted', false))

    if (query.dateFrom) {
      queryBuilder = queryBuilder.extend(Q.where('meal_datetime', Q.gte(query.dateFrom.getTime())))
    }

    if (query.dateTo) {
      queryBuilder = queryBuilder.extend(Q.where('meal_datetime', Q.lte(query.dateTo.getTime())))
    }

    if (query.cuisine_type) {
      queryBuilder = queryBuilder.extend(Q.where('cuisine_type', query.cuisine_type))
    }

    if (query.is_homemade !== undefined) {
      queryBuilder = queryBuilder.extend(Q.where('is_homemade', query.is_homemade))
    }

    if (query.cooking_level) {
      queryBuilder = queryBuilder.extend(Q.where('cooking_level', query.cooking_level))
    }

    if (query.location_name) {
      queryBuilder = queryBuilder.extend(Q.where('location_name', Q.like(`%${query.location_name}%`)))
    }

    return await queryBuilder.fetch()
  }

  // Full text search
  static async searchMealsByText(searchText: string): Promise<any[]> {
    const collection = database.get('meals')
    const queryBuilder = collection.query(
      Q.where('is_deleted', false),
      Q.or(
        Q.where('meal_name', Q.like(`%${searchText}%`)),
        Q.where('notes', Q.like(`%${searchText}%`)),
        Q.where('search_text', Q.like(`%${searchText}%`))
      )
    )
    return await queryBuilder.fetch()
  }

  // Get meals by date range
  static async getMealsByDateRange(startDate: Date, endDate: Date): Promise<any[]> {
    const collection = database.get('meals')
    return await collection.query(
      Q.where('is_deleted', false),
      Q.where('meal_datetime', Q.gte(startDate.getTime())),
      Q.where('meal_datetime', Q.lte(endDate.getTime()))
    ).fetch()
  }

  // Get recent meals
  static async getRecentMeals(limit: number = 20): Promise<any[]> {
    const collection = database.get('meals')
    const meals = await collection.query(Q.where('is_deleted', false)).fetch()
    return meals.slice(-limit).reverse() // Get most recent
  }

  // Soft delete meal
  static async softDeleteMeal(mealId: string): Promise<void> {
    await database.write(async () => {
      const meal = await database.get('meals').find(mealId)
      await meal.update((record: any) => {
        record.is_deleted = true
        record.updated_at = Date.now()
      })
    })
  }

  // Update meal
  static async updateMeal(mealId: string, updates: Partial<CreateMealData>): Promise<any> {
    return await database.write(async () => {
      const meal = await database.get('meals').find(mealId)
      await meal.update((record: any) => {
        if (updates.meal_name !== undefined) record.meal_name = updates.meal_name
        if (updates.meal_type !== undefined) record.meal_type = updates.meal_type
        if (updates.cuisine_type !== undefined) record.cuisine_type = updates.cuisine_type
        if (updates.notes !== undefined) record.notes = updates.notes
        if (updates.cooking_level !== undefined) record.cooking_level = updates.cooking_level
        if (updates.photo_path !== undefined) record.photo_path = updates.photo_path
        if (updates.photo_thumbnail_path !== undefined) record.photo_thumbnail_path = updates.photo_thumbnail_path
        if (updates.location_name !== undefined) record.location_name = updates.location_name
        if (updates.latitude !== undefined) record.latitude = updates.latitude
        if (updates.longitude !== undefined) record.longitude = updates.longitude
        if (updates.meal_datetime !== undefined) record.meal_datetime = updates.meal_datetime.getTime()
        if (updates.search_text !== undefined) record.search_text = updates.search_text
        record.updated_at = Date.now()
      })
      return meal
    })
  }

  // Get statistics
  static async getStatistics(): Promise<{
    totalMeals: number
    homemadeMeals: number
    takeoutMeals: number
    favoriteCuisine?: string
  }> {
    const meals = await database.get('meals').query(Q.where('is_deleted', false)).fetch()

    const homemadeCount = meals.filter((meal: any) => meal.is_homemade).length
    const takeoutCount = meals.length - homemadeCount

    // Calculate favorite cuisine (most frequent)
    const cuisineCounts = meals.reduce((acc: any, meal: any) => {
      const cuisine = meal.cuisine_type || 'Other'
      acc[cuisine] = (acc[cuisine] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const favoriteCuisine = Object.entries(cuisineCounts)
      .sort(([,a]: any, [,b]: any) => (b as number) - (a as number))[0]?.[0]

    return {
      totalMeals: meals.length,
      homemadeMeals: homemadeCount,
      takeoutMeals: takeoutCount,
      favoriteCuisine
    }
  }

  // Generate search text for full-text search
  private static generateSearchText(data: Partial<CreateMealData>): string {
    const parts = []
    if (data.meal_name) parts.push(data.meal_name)
    if (data.cuisine_type) parts.push(data.cuisine_type)
    if (data.location_name) parts.push(data.location_name)
    if (data.notes) parts.push(data.notes)
    if (data.ingredients) {
      parts.push(...data.ingredients.map(ing => ing.name))
    }
    return parts.join(' ').toLowerCase()
  }
}
