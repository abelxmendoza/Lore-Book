import { logger } from '../../logger';

import { ForecastGenerator } from './forecastGenerator';
import { PatternAnalyzer } from './patternAnalyzer';
import { PredictionStorage } from './predictionStorage';
import type { Forecast, Prediction, PatternAnalysis } from './types';

/**
 * Main Prediction Engine
 * Analyzes patterns and generates predictions
 */
export class PredictionEngine {
  private analyzer: PatternAnalyzer;
  private generator: ForecastGenerator;
  private storage: PredictionStorage;

  constructor() {
    this.analyzer = new PatternAnalyzer();
    this.generator = new ForecastGenerator();
    this.storage = new PredictionStorage();
  }

  /**
   * Generate forecast for user
   */
  async generateForecast(
    userId: string,
    horizonDays: number = 30,
    lookbackDays: number = 365
  ): Promise<Forecast> {
    try {
      logger.debug({ userId, horizonDays, lookbackDays }, 'Generating forecast');

      // Analyze patterns
      const patterns = await this.analyzer.analyzeEntryPatterns(userId, lookbackDays);

      // Generate predictions from patterns
      const predictions = this.generator.generatePredictions(patterns, userId, horizonDays);

      // Save predictions
      const saved = await this.storage.savePredictions(predictions);

      // Mark expired predictions
      await this.storage.markExpired(userId);

      // Calculate confidence summary
      const confidenceSummary = {
        high: predictions.filter(p => p.confidence === 'high' || p.confidence === 'very_high').length,
        medium: predictions.filter(p => p.confidence === 'medium').length,
        low: predictions.filter(p => p.confidence === 'low').length,
      };

      logger.info(
        { userId, predictions: saved.length },
        'Generated forecast'
      );

      return {
        predictions: saved,
        patterns_analyzed: patterns,
        forecast_horizon_days: horizonDays,
        generated_at: new Date().toISOString(),
        confidence_summary: confidenceSummary,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate forecast');
      return {
        predictions: [],
        patterns_analyzed: [],
        forecast_horizon_days: horizonDays,
        generated_at: new Date().toISOString(),
        confidence_summary: {
          high: 0,
          medium: 0,
          low: 0,
        },
      };
    }
  }

  /**
   * Get active predictions
   */
  async getActivePredictions(
    userId: string,
    limit?: number,
    type?: string
  ): Promise<Prediction[]> {
    return this.storage.getActivePredictions(userId, limit, type as any);
  }

  /**
   * Get predictions by date range
   */
  async getPredictionsByDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<Prediction[]> {
    return this.storage.getPredictionsByDateRange(userId, startDate, endDate);
  }

  /**
   * Update prediction status
   */
  async updatePredictionStatus(
    predictionId: string,
    status: 'confirmed' | 'refuted' | 'partial' | 'expired'
  ): Promise<boolean> {
    return this.storage.updateStatus(predictionId, status);
  }

  /**
   * Get prediction statistics
   */
  async getStats(userId: string) {
    return this.storage.getStats(userId);
  }
}

