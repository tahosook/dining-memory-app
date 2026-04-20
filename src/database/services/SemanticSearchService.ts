import {
  getLocalLlamaTextEmbeddingAvailability,
} from '../../ai/runtime';
import type { Meal } from '../../types/MealTypes';
import { MealEmbeddingService } from './MealEmbeddingService';

export interface SemanticMealMatch {
  mealId: string;
  score: number;
}

const MAX_SEMANTIC_HITS = 10;

function cosineSimilarity(first: number[], second: number[]) {
  if (first.length === 0 || first.length !== second.length) {
    return Number.NEGATIVE_INFINITY;
  }

  let dotProduct = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;

  for (let index = 0; index < first.length; index += 1) {
    dotProduct += first[index] * second[index];
    firstMagnitude += first[index] * first[index];
    secondMagnitude += second[index] * second[index];
  }

  if (firstMagnitude === 0 || secondMagnitude === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return dotProduct / (Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude));
}

export class SemanticSearchService {
  static async scoreMeals(
    query: string,
    meals: Pick<Meal, 'id'>[]
  ): Promise<SemanticMealMatch[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || meals.length === 0) {
      return [];
    }

    try {
      const availability = await getLocalLlamaTextEmbeddingAvailability();
      if (availability.kind !== 'ready') {
        return [];
      }

      const queryEmbedding = await availability.provider.generateEmbedding(trimmedQuery);
      const candidateMealIds = new Set(meals.map((meal) => meal.id));
      const embeddings = await MealEmbeddingService.listEmbeddings();

      return embeddings
        .filter((embedding) =>
          candidateMealIds.has(embedding.mealId)
          && embedding.vectorModel === queryEmbedding.modelId
          && embedding.vectorDimension === queryEmbedding.dimension
          && embedding.vector.length === queryEmbedding.vector.length
        )
        .map((embedding) => ({
          mealId: embedding.mealId,
          score: cosineSimilarity(queryEmbedding.vector, embedding.vector),
        }))
        .filter((match) => Number.isFinite(match.score) && match.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, MAX_SEMANTIC_HITS);
    } catch {
      return [];
    }
  }
}
