/**
 * Prediction Engine Analytics Module
 * Forecasts mood, predicts events, and identifies risk zones
 */

import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData } from './types';

interface Forecast {
  date: string;
  value: number;
  confidence: number;
}

interface RiskZone {
  date: string;
  risk: number;
  type: 'negative' | 'positive' | 'volatility';
  description: string;
}

interface Prediction {
  type: string;
  description: string;
  confidence: number;
  horizon: string;
}

export class PredictionEngineModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'predictions' as const;

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    const memories = await this.fetchMemories(userId);
    
    if (memories.length < 10) {
      return this.emptyPayload();
    }

    // Sort by date
    memories.sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Generate mood forecast
    const forecast = this.generateMoodForecast(memories);
    
    // Detect risk zones
    const riskZones = this.detectRiskZones(memories, forecast);
    
    // Generate predictions
    const predictions = this.generatePredictions(memories, forecast);

    const payload: AnalyticsPayload = {
      metrics: {
        totalMemories: memories.length,
        forecastDays: forecast.length,
        riskZones: riskZones.length,
        predictions: predictions.length,
        averageConfidence: predictions.length > 0
          ? predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
          : 0,
      },
      charts: [
        {
          type: 'line',
          title: 'Mood Forecast',
          data: forecast.map(f => ({
            date: f.date,
            value: f.value,
            confidence: f.confidence,
          })),
          xAxis: 'date',
          yAxis: 'value',
        },
        {
          type: 'area',
          title: 'Risk Zones',
          data: riskZones.map(r => ({
            date: r.date,
            risk: r.risk,
            type: r.type,
          })),
          xAxis: 'date',
          yAxis: 'risk',
        },
      ],
      insights: [
        ...this.generateForecastInsights(forecast),
        ...this.generateRiskInsights(riskZones),
        ...predictions.map(p => ({
          text: p.description,
          category: 'prediction',
          score: p.confidence,
        })),
      ],
      summary: this.generateSummary(forecast, riskZones, predictions),
    };

    await this.cacheResult(userId, payload);
    return payload;
  }

  /**
   * Generate mood forecast using rolling average
   */
  private generateMoodForecast(memories: MemoryData[]): Forecast[] {
    const forecast: Forecast[] = [];
    
    if (memories.length < 5) {
      return forecast;
    }

    // Extract sentiment time series
    const sentiments = memories.map(m => m.sentiment ?? 0);
    const dates = memories.map(m => new Date(m.created_at));

    // Use EMA for smoothing
    const smoothed = this.ema(sentiments, 0.3);

    // Compute trend (slope)
    const trend = this.computeTrend(smoothed);

    // Forecast next 7 days
    const lastDate = dates[dates.length - 1];
    const lastValue = smoothed[smoothed.length - 1];

    for (let i = 1; i <= 7; i++) {
      const forecastDate = new Date(lastDate);
      forecastDate.setDate(forecastDate.getDate() + i);
      
      // Simple linear projection with decay
      const projectedValue = lastValue + (trend * i * 0.5); // Decay factor
      const confidence = Math.max(0.3, 1 - (i * 0.1)); // Decreasing confidence

      forecast.push({
        date: forecastDate.toISOString(),
        value: Math.max(-1, Math.min(1, projectedValue)), // Clamp to [-1, 1]
        confidence,
      });
    }

    return forecast;
  }

  /**
   * Compute trend (slope) from time series
   */
  private computeTrend(values: number[]): number {
    if (values.length < 2) {
      return 0;
    }

    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  }

  /**
   * Detect risk zones using volatility and trend analysis
   */
  private detectRiskZones(memories: MemoryData[], forecast: Forecast[]): RiskZone[] {
    const riskZones: RiskZone[] = [];

    if (memories.length < 5) {
      return riskZones;
    }

    // Analyze historical volatility
    const sentiments = memories.map(m => m.sentiment ?? 0);
    const volatility = this.computeVolatility(sentiments);

    // Check forecast for risk zones
    for (const point of forecast) {
      // Negative risk zone
      if (point.value < -0.5) {
        riskZones.push({
          date: point.date,
          risk: Math.abs(point.value),
          type: 'negative',
          description: `Potential low mood period around ${new Date(point.date).toLocaleDateString()}.`,
        });
      }
      
      // High volatility risk
      if (volatility > 0.7 && point.confidence < 0.6) {
        riskZones.push({
          date: point.date,
          risk: volatility,
          type: 'volatility',
          description: `High uncertainty period - mood may fluctuate significantly.`,
        });
      }
    }

    // Check for upcoming positive surges
    const positiveTrend = forecast.filter(f => f.value > 0.3);
    if (positiveTrend.length > 0) {
      const strongest = positiveTrend.reduce((max, f) => f.value > max.value ? f : max, positiveTrend[0]);
      riskZones.push({
        date: strongest.date,
        risk: strongest.value,
        type: 'positive',
        description: `Potential positive momentum around ${new Date(strongest.date).toLocaleDateString()}.`,
      });
    }

    return riskZones.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Compute volatility (standard deviation)
   */
  private computeVolatility(values: number[]): number {
    return this.standardDeviation(values);
  }

  /**
   * Generate predictions using Markov chain-like analysis
   */
  private generatePredictions(memories: MemoryData[], forecast: Forecast[]): Prediction[] {
    const predictions: Prediction[] = [];

    if (memories.length < 10) {
      return predictions;
    }

    // Predict mood trajectory
    const avgForecast = forecast.reduce((sum, f) => sum + f.value, 0) / forecast.length;
    if (avgForecast > 0.2) {
      predictions.push({
        type: 'mood',
        description: `Your mood is forecasted to remain positive over the next week.`,
        confidence: 0.7,
        horizon: '7 days',
      });
    } else if (avgForecast < -0.2) {
      predictions.push({
        type: 'mood',
        description: `Your mood may be challenging over the next week. Consider self-care activities.`,
        confidence: 0.7,
        horizon: '7 days',
      });
    }

    // Predict topic continuation
    const recentTopics = this.getRecentTopics(memories, 7);
    if (recentTopics.length > 0) {
      predictions.push({
        type: 'topic',
        description: `You're likely to continue writing about ${recentTopics[0]} in the coming days.`,
        confidence: 0.6,
        horizon: '3-5 days',
      });
    }

    // Predict arc trajectory
    const arcTrajectory = this.predictArcTrajectory(memories);
    if (arcTrajectory) {
      predictions.push(arcTrajectory);
    }

    return predictions;
  }

  /**
   * Get recent topics (last N days)
   */
  private getRecentTopics(memories: MemoryData[], days: number): string[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const recentMemories = memories.filter(m => new Date(m.created_at) >= cutoff);
    const topicCounts = new Map<string, number>();

    for (const memory of recentMemories) {
      for (const topic of memory.topics || []) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic);
  }

  /**
   * Predict arc trajectory
   */
  private predictArcTrajectory(memories: MemoryData[]): Prediction | null {
    if (memories.length < 14) {
      return null;
    }

    // Analyze recent sentiment trend
    const recent = memories.slice(-14);
    const recentSentiments = recent.map(m => m.sentiment ?? 0);
    const trend = this.computeTrend(recentSentiments);

    if (trend > 0.01) {
      return {
        type: 'arc',
        description: `Your current arc shows positive momentum. This trajectory is likely to continue.`,
        confidence: 0.65,
        horizon: '2-3 weeks',
      };
    } else if (trend < -0.01) {
      return {
        type: 'arc',
        description: `Your current arc shows declining momentum. A shift or intervention may be needed.`,
        confidence: 0.65,
        horizon: '2-3 weeks',
      };
    }

    return null;
  }

  /**
   * Generate insights
   */
  private generateForecastInsights(forecast: Forecast[]): Array<{ text: string; category: string; score: number }> {
    if (forecast.length === 0) {
      return [];
    }

    const avgForecast = forecast.reduce((sum, f) => sum + f.value, 0) / forecast.length;
    const confidence = forecast.reduce((sum, f) => sum + f.confidence, 0) / forecast.length;

    return [
      {
        text: `Mood forecast for next 7 days: ${avgForecast > 0 ? 'positive' : avgForecast < 0 ? 'challenging' : 'neutral'} trend (confidence: ${(confidence * 100).toFixed(0)}%).`,
        category: 'forecast',
        score: confidence,
      },
    ];
  }

  private generateRiskInsights(riskZones: RiskZone[]): Array<{ text: string; category: string; score: number }> {
    if (riskZones.length === 0) {
      return [];
    }

    const negativeRisks = riskZones.filter(r => r.type === 'negative');
    const positiveRisks = riskZones.filter(r => r.type === 'positive');

    const insights = [];

    if (negativeRisks.length > 0) {
      insights.push({
        text: `${negativeRisks.length} potential challenging period${negativeRisks.length > 1 ? 's' : ''} detected in the forecast. Consider planning self-care activities.`,
        category: 'risk_zone',
        score: negativeRisks.reduce((sum, r) => sum + r.risk, 0) / negativeRisks.length,
      });
    }

    if (positiveRisks.length > 0) {
      insights.push({
        text: `${positiveRisks.length} potential positive surge${positiveRisks.length > 1 ? 's' : ''} detected. Good time to plan meaningful activities.`,
        category: 'risk_zone',
        score: positiveRisks.reduce((sum, r) => sum + r.risk, 0) / positiveRisks.length,
      });
    }

    return insights;
  }

  private generateSummary(forecast: Forecast[], riskZones: RiskZone[], predictions: Prediction[]): string {
    let summary = `Based on ${forecast.length} days of forecast data, `;
    
    if (forecast.length > 0) {
      const avgForecast = forecast.reduce((sum, f) => sum + f.value, 0) / forecast.length;
      summary += `your mood is projected to be ${avgForecast > 0.2 ? 'positive' : avgForecast < -0.2 ? 'challenging' : 'neutral'} over the next week. `;
    }

    if (riskZones.length > 0) {
      summary += `${riskZones.length} risk zone${riskZones.length > 1 ? 's' : ''} identified. `;
    }

    if (predictions.length > 0) {
      summary += `${predictions.length} prediction${predictions.length > 1 ? 's' : ''} generated for upcoming periods.`;
    }

    return summary;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      insights: [],
      summary: 'Not enough data to generate prediction analytics.',
    };
  }
}

export const predictionEngineModule = new PredictionEngineModule();
