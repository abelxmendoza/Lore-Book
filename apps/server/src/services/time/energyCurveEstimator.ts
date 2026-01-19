import { logger } from '../../logger';

import type { TimeEvent, EnergyCurvePoint } from './types';

/**
 * Estimates energy curve throughout the day
 */
export class EnergyCurveEstimator {
  /**
   * Estimate energy curve from hourly events
   */
  estimate(events: TimeEvent[]): EnergyCurvePoint[] {
    const curve: EnergyCurvePoint[] = [];

    try {
      // Group events by hour
      const hourlyEvents: Record<number, TimeEvent[]> = {};

      for (let hour = 0; hour < 24; hour++) {
        hourlyEvents[hour] = [];
      }

      events.forEach((event) => {
        const date = new Date(event.timestamp);
        const hour = date.getHours();
        hourlyEvents[hour].push(event);
      });

      // Calculate energy level for each hour
      for (let hour = 0; hour < 24; hour++) {
        const hourEvents = hourlyEvents[hour];

        // Energy indicators: productive activities = higher energy
        const productiveCategories = ['coding', 'robotics', 'gym', 'bjj', 'muay_thai', 'learning', 'work'];
        const restCategories = ['sleep', 'rest', 'eating'];

        let energyScore = 0;
        let totalWeight = 0;

        hourEvents.forEach((event) => {
          if (productiveCategories.includes(event.category)) {
            energyScore += 1;
            totalWeight += 1;
          } else if (restCategories.includes(event.category)) {
            energyScore += 0.2; // Low energy during rest
            totalWeight += 0.5;
          } else {
            energyScore += 0.5; // Neutral
            totalWeight += 0.5;
          }
        });

        // Calculate level (normalize to 0-1)
        const level = hourEvents.length > 0
          ? Math.min(1, energyScore / Math.max(1, totalWeight))
          : 0.3; // Default low energy if no events

        curve.push({
          hour,
          level,
          count: hourEvents.length,
        });
      }

      logger.debug({ curve: curve.length }, 'Estimated energy curve');

      return curve;
    } catch (error) {
      logger.error({ error }, 'Failed to estimate energy curve');
      // Return default curve
      return Array.from({ length: 24 }, (_, hour) => ({
        hour,
        level: 0.5,
        count: 0,
      }));
    }
  }

  /**
   * Get peak energy hours
   */
  getPeakHours(curve: EnergyCurvePoint[]): number[] {
    if (curve.length === 0) return [];

    const avgLevel = curve.reduce((sum, p) => sum + p.level, 0) / curve.length;
    const threshold = avgLevel * 1.2; // 20% above average

    return curve
      .filter(p => p.level >= threshold)
      .map(p => p.hour)
      .sort((a, b) => {
        const aLevel = curve.find(p => p.hour === a)?.level || 0;
        const bLevel = curve.find(p => p.hour === b)?.level || 0;
        return bLevel - aLevel;
      });
  }

  /**
   * Get low energy hours
   */
  getLowEnergyHours(curve: EnergyCurvePoint[]): number[] {
    if (curve.length === 0) return [];

    const avgLevel = curve.reduce((sum, p) => sum + p.level, 0) / curve.length;
    const threshold = avgLevel * 0.8; // 20% below average

    return curve
      .filter(p => p.level <= threshold)
      .map(p => p.hour)
      .sort((a, b) => {
        const aLevel = curve.find(p => p.hour === a)?.level || 0;
        const bLevel = curve.find(p => p.hour === b)?.level || 0;
        return aLevel - bLevel;
      });
  }
}

