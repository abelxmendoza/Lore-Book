/**
 * Engine Health Monitoring
 * Tracks engine performance, errors, and output quality
 * Internal-only tooling (not exposed to users)
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { ENGINE_DESCRIPTORS } from './engineRegistry';
import type { EngineHealth } from './types';

interface EngineRunRecord {
  engineName: string;
  runTime: Date;
  duration: number;
  success: boolean;
  error?: string;
  outputCount: number;
  avgConfidence: number;
}

class EngineHealthMonitor {
  private runHistory: Map<string, EngineRunRecord[]> = new Map();
  private readonly MAX_HISTORY = 100; // Keep last 100 runs per engine

  /**
   * Record an engine run
   */
  recordRun(
    engineName: string,
    duration: number,
    success: boolean,
    outputCount: number = 0,
    avgConfidence: number = 0.5,
    error?: string
  ): void {
    const record: EngineRunRecord = {
      engineName,
      runTime: new Date(),
      duration,
      success,
      error,
      outputCount,
      avgConfidence
    };

    if (!this.runHistory.has(engineName)) {
      this.runHistory.set(engineName, []);
    }

    const history = this.runHistory.get(engineName)!;
    history.push(record);

    // Keep only recent history
    if (history.length > this.MAX_HISTORY) {
      history.shift();
    }

    // Log to database (fire and forget)
    this.saveRunRecord(record).catch(err => {
      logger.debug({ err }, 'Failed to save engine run record');
    });
  }

  /**
   * Get health status for an engine
   */
  getEngineHealth(engineName: string): EngineHealth {
    const history = this.runHistory.get(engineName) || [];
    const descriptor = ENGINE_DESCRIPTORS[engineName];

    if (history.length === 0) {
      return {
        engineName,
        lastRunTime: null,
        lastRunDuration: null,
        successRate: 1.0,
        errorCount: 0,
        outputVolume: 0,
        confidenceDistribution: { high: 0, medium: 0, low: 0 },
        isHealthy: true
      };
    }

    const recentRuns = history.slice(-20); // Last 20 runs
    const successfulRuns = recentRuns.filter(r => r.success);
    const failedRuns = recentRuns.filter(r => !r.success);

    const lastRun = history[history.length - 1];
    const avgDuration = recentRuns.reduce((sum, r) => sum + r.duration, 0) / recentRuns.length;
    const avgOutputVolume = recentRuns.reduce((sum, r) => sum + r.outputCount, 0) / recentRuns.length;
    const successRate = successfulRuns.length / recentRuns.length;

    // Calculate confidence distribution
    const confidences = recentRuns.map(r => r.avgConfidence);
    const high = confidences.filter(c => c > 0.7).length;
    const medium = confidences.filter(c => c >= 0.4 && c <= 0.7).length;
    const low = confidences.filter(c => c < 0.4).length;

    // Determine health status
    const isHealthy = successRate > 0.8 && failedRuns.length < 3;

    return {
      engineName,
      lastRunTime: lastRun.runTime,
      lastRunDuration: avgDuration,
      successRate,
      errorCount: failedRuns.length,
      outputVolume: avgOutputVolume,
      confidenceDistribution: { high, medium, low },
      isHealthy
    };
  }

  /**
   * Get health for all engines
   */
  getAllEngineHealth(): EngineHealth[] {
    return Object.keys(ENGINE_DESCRIPTORS).map(name => this.getEngineHealth(name));
  }

  /**
   * Get unhealthy engines
   */
  getUnhealthyEngines(): EngineHealth[] {
    return this.getAllEngineHealth().filter(h => !h.isHealthy);
  }

  /**
   * Get engines with low success rate
   */
  getLowSuccessEngines(threshold: number = 0.7): EngineHealth[] {
    return this.getAllEngineHealth().filter(h => h.successRate < threshold);
  }

  /**
   * Get engines that haven't run recently
   */
  getStaleEngines(maxAgeHours: number = 24): EngineHealth[] {
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    const now = Date.now();

    return this.getAllEngineHealth().filter(h => {
      if (!h.lastRunTime) return true;
      const age = now - h.lastRunTime.getTime();
      return age > maxAge;
    });
  }

  /**
   * Save run record to database
   */
  private async saveRunRecord(record: EngineRunRecord): Promise<void> {
    try {
      await supabaseAdmin
        .from('engine_runs')
        .insert({
          engine_name: record.engineName,
          run_time: record.runTime.toISOString(),
          duration_ms: record.duration,
          success: record.success,
          error: record.error,
          output_count: record.outputCount,
          avg_confidence: record.avgConfidence
        });
    } catch (error) {
      // Fail silently - this is monitoring, not critical
      logger.debug({ error }, 'Failed to save engine run record');
    }
  }

  /**
   * Get redundancy overlaps (engines that do similar things)
   */
  getRedundancyReport(): Array<{ engines: string[]; overlap: string }> {
    // This would analyze engine outputs to find overlaps
    // For now, return known overlaps
    return [
      {
        engines: ['shadowEngine', 'shadowEngine (analytics)'],
        overlap: 'Both detect shadow aspects, consider consolidating'
      },
      {
        engines: ['personalityEngine', 'essenceProfile'],
        overlap: 'Both extract personality traits, essenceProfile is more comprehensive'
      }
    ];
  }
}

export const engineHealthMonitor = new EngineHealthMonitor();
