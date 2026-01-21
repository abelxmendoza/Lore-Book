import type { MemoryEntry } from '../../types';

export type TemporalQueryType = 'recent' | 'historical' | 'all' | 'specific';

export interface TemporalWeightConfig {
  queryType: TemporalQueryType;
  timeRange?: { start?: Date; end?: Date };
  decayFunction: 'exponential' | 'linear' | 'inverse' | 'step';
  halfLife?: number; // Days for exponential decay
}

/**
 * Advanced Temporal Weighting Service
 * Applies sophisticated temporal weighting based on query type and decay functions
 */
export class TemporalWeighting {
  /**
   * Calculate temporal weight for an entry
   */
  calculateWeight(
    entry: MemoryEntry,
    config: TemporalWeightConfig
  ): number {
    const entryDate = this.getEntryDate(entry);
    if (!entryDate) {
      return 0.5; // Default weight for entries without dates
    }

    const daysAgo = this.getDaysAgo(entryDate);

    switch (config.queryType) {
      case 'recent':
        return this.recentWeight(daysAgo, config);
      case 'historical':
        return this.historicalWeight(daysAgo, config);
      case 'specific':
        return this.specificWeight(entryDate, config);
      case 'all':
      default:
        return this.allWeight(daysAgo, config);
    }
  }

  /**
   * Weight for recent queries
   */
  private recentWeight(daysAgo: number, config: TemporalWeightConfig): number {
    switch (config.decayFunction) {
      case 'exponential':
        const halfLife = config.halfLife || 30;
        return Math.exp(-daysAgo / halfLife);
      
      case 'linear':
        const maxDays = 90;
        return Math.max(0, 1 - (daysAgo / maxDays));
      
      case 'inverse':
        return 1 / (1 + daysAgo / 30);
      
      case 'step':
        if (daysAgo <= 7) return 1.0;
        if (daysAgo <= 30) return 0.8;
        if (daysAgo <= 90) return 0.5;
        return 0.2;
      
      default:
        return Math.exp(-daysAgo / 30);
    }
  }

  /**
   * Weight for historical queries
   */
  private historicalWeight(daysAgo: number, config: TemporalWeightConfig): number {
    switch (config.decayFunction) {
      case 'exponential':
        // Invert: older is better
        const halfLife = config.halfLife || 365;
        return 1 - Math.exp(-daysAgo / halfLife);
      
      case 'linear':
        const maxDays = 365 * 5; // 5 years
        return Math.min(1, daysAgo / maxDays);
      
      case 'inverse':
        // Inverse decay: older entries get higher weight
        return 1 / (1 + 365 / daysAgo);
      
      case 'step':
        if (daysAgo > 365) return 1.0;
        if (daysAgo > 180) return 0.8;
        if (daysAgo > 90) return 0.5;
        return 0.2;
      
      default:
        return 1 / (1 + 365 / daysAgo);
    }
  }

  /**
   * Weight for specific time range queries
   */
  private specificWeight(entryDate: Date, config: TemporalWeightConfig): number {
    if (!config.timeRange) {
      return 0.5;
    }

    const { start, end } = config.timeRange;
    const entryTime = entryDate.getTime();

    // Check if entry is within range
    if (start && entryTime < start.getTime()) {
      return 0.1; // Before range
    }
    if (end && entryTime > end.getTime()) {
      return 0.1; // After range
    }

    // Within range - calculate proximity to center
    if (start && end) {
      const center = (start.getTime() + end.getTime()) / 2;
      const distance = Math.abs(entryTime - center);
      const range = end.getTime() - start.getTime();
      return 1 - (distance / range);
    }

    return 1.0; // Within range
  }

  /**
   * Weight for all queries (balanced)
   */
  private allWeight(daysAgo: number, config: TemporalWeightConfig): number {
    switch (config.decayFunction) {
      case 'exponential':
        const halfLife = config.halfLife || 90;
        return Math.exp(-daysAgo / halfLife);
      
      case 'linear':
        const maxDays = 180;
        return Math.max(0.3, 1 - (daysAgo / maxDays));
      
      case 'inverse':
        return 1 / (1 + daysAgo / 90);
      
      case 'step':
        if (daysAgo <= 30) return 1.0;
        if (daysAgo <= 90) return 0.8;
        if (daysAgo <= 180) return 0.6;
        return 0.4;
      
      default:
        return 1 / (1 + daysAgo / 90);
    }
  }

  /**
   * Get entry date
   */
  private getEntryDate(entry: MemoryEntry): Date | null {
    if (entry.date) {
      return new Date(entry.date);
    }
    if (entry.created_at) {
      return new Date(entry.created_at);
    }
    if (entry.timestamp) {
      return new Date(entry.timestamp);
    }
    return null;
  }

  /**
   * Get days ago from entry date
   */
  private getDaysAgo(entryDate: Date): number {
    const now = Date.now();
    const entryTime = entryDate.getTime();
    return (now - entryTime) / (1000 * 60 * 60 * 24);
  }

  /**
   * Detect temporal query type from query text
   */
  detectTemporalType(query: string): TemporalQueryType {
    const lower = query.toLowerCase();

    if (lower.match(/\b(recent|recently|lately|latest|current|now|today|this week|this month)\b/)) {
      return 'recent';
    }

    if (lower.match(/\b(past|ago|before|earlier|history|historical|old|years ago)\b/)) {
      return 'historical';
    }

    if (lower.match(/\b(in|during|on|at)\s+(19|20)\d{2}\b/) || 
        lower.match(/\b(19|20)\d{2}\b/) ||
        lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/)) {
      return 'specific';
    }

    return 'all';
  }
}

export const temporalWeighting = new TemporalWeighting();
