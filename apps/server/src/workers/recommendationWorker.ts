import { logger } from '../logger';
import { RecommendationEngine } from '../services/recommendation/recommendationEngine';
import { recommendationStorageService } from '../services/recommendation/storageService';

const recommendationEngine = new RecommendationEngine();

/**
 * Generate recommendations for a user
 */
export const generateRecommendationsForUser = async (userId: string): Promise<void> => {
  try {
    logger.info({ userId }, 'Starting recommendation generation');

    // Generate recommendations
    const recommendations = await recommendationEngine.generateRecommendations(userId);

    if (recommendations.length === 0) {
      logger.debug({ userId }, 'No recommendations generated');
      return;
    }

    // Save to database
    await recommendationStorageService.saveRecommendations(recommendations);

    // Mark expired recommendations
    await recommendationStorageService.markAsExpired(userId);

    logger.info(
      { userId, count: recommendations.length },
      'Successfully generated and saved recommendations'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to generate recommendations');
    throw error;
  }
};

