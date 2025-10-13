import { database } from '../models'
import { Platform } from 'react-native'
// import { Q } from '@nozbe/watermelondb'  // Disable for Web compatibility

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
  // Create a new meal record - Web mock implementation
  static async createMeal(data: CreateMealData): Promise<any> {
    console.log('MealService.createMeal called (Web mock)', data)
    return {
      id: 'mock_' + Date.now(),
      ...data,
      meal_datetime: data.meal_datetime.getTime()
    }
  }

  // Search meals with filters - Web mock implementation
  static async searchMeals(query: SearchFilters = {}): Promise<any[]> {
    console.log('MealService.searchMeals called (Web mock)', query)
    return []
  }

  // Full text search - Web mock implementation
  static async searchMealsByText(searchText: string): Promise<any[]> {
    console.log('MealService.searchMealsByText called (Web mock)', searchText)
    return []
  }

  // Get meals by date range - Web mock implementation
  static async getMealsByDateRange(startDate: Date, endDate: Date): Promise<any[]> {
    console.log('MealService.getMealsByDateRange called (Web mock)', { startDate, endDate })
    return []
  }

  // Get recent meals - Web mock implementation
  static async getRecentMeals(limit: number = 20): Promise<any[]> {
    console.log('MealService.getRecentMeals called (Web mock)', limit)
    return []
  }

  // Soft delete meal - Web mock implementation
  static async softDeleteMeal(mealId: string): Promise<void> {
    console.log('MealService.softDeleteMeal called (Web mock)', mealId)
    return Promise.resolve()
  }

  // Update meal - Web mock implementation
  static async updateMeal(mealId: string, updates: Partial<CreateMealData>): Promise<any> {
    console.log('MealService.updateMeal called (Web mock)', { mealId, updates })
    return { id: mealId, ...updates }
  }

  // Get statistics - Web mock implementation
  static async getStatistics(): Promise<{
    totalMeals: number
    homemadeMeals: number
    takeoutMeals: number
    favoriteCuisine?: string
  }> {
    console.log('MealService.getStatistics called (Web mock)')
    return {
      totalMeals: 0,
      homemadeMeals: 0,
      takeoutMeals: 0,
      favoriteCuisine: undefined
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
