import { logger } from '../../logger';
import type { SetbackSignal, RecoverySignal, ResilienceTimelinePoint } from './types';

/**
 * Builds chronological resilience curve
 */
export class ResilienceTimeline {
  /**
   * Build timeline from setbacks and recovery signals
   */
  build(
    setbacks: SetbackSignal[],
    recovery: RecoverySignal[]
  ): ResilienceTimelinePoint[] {
    const timeline: ResilienceTimelinePoint[] = [];

    try {
      // Create a map of recovery signals by setback timestamp
      const recoveryMap = new Map<string, RecoverySignal>();
      for (const rec of recovery) {
        if (rec.setback_id) {
          recoveryMap.set(rec.setback_id, rec);
        }
      }

      // Build timeline points
      for (const setback of setbacks) {
        const rec = recoveryMap.get(setback.id) || recovery.find(r => r.timestamp === setback.timestamp);
        
        const point: ResilienceTimelinePoint = {
          timestamp: setback.timestamp,
          setback: setback.severity,
          recovery: rec?.improvement || 0,
        };

        // Calculate resilience at this point (recovery - setback, normalized)
        point.resilience = Math.max(0, Math.min(1, point.recovery - point.setback + 0.5));

        timeline.push(point);
      }

      // Sort by timestamp
      timeline.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      });

      logger.debug({ points: timeline.length }, 'Built resilience timeline');

      return timeline;
    } catch (error) {
      logger.error({ error }, 'Failed to build resilience timeline');
      return [];
    }
  }

  /**
   * Get timeline summary
   */
  getSummary(timeline: ResilienceTimelinePoint[]): {
    total_points: number;
    average_setback: number;
    average_recovery: number;
    average_resilience: number;
    recovery_rate: number; // percentage of setbacks with recovery > 0
    time_span_days: number;
  } {
    if (timeline.length === 0) {
      return {
        total_points: 0,
        average_setback: 0,
        average_recovery: 0,
        average_resilience: 0,
        recovery_rate: 0,
        time_span_days: 0,
      };
    }

    const totalSetback = timeline.reduce((sum, p) => sum + p.setback, 0);
    const totalRecovery = timeline.reduce((sum, p) => sum + p.recovery, 0);
    const totalResilience = timeline.reduce((sum, p) => sum + (p.resilience || 0), 0);

    const recoveries = timeline.filter(p => p.recovery > 0).length;
    const recoveryRate = (recoveries / timeline.length) * 100;

    const first = new Date(timeline[0].timestamp);
    const last = new Date(timeline[timeline.length - 1].timestamp);
    const timeSpanDays = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);

    return {
      total_points: timeline.length,
      average_setback: totalSetback / timeline.length,
      average_recovery: totalRecovery / timeline.length,
      average_resilience: totalResilience / timeline.length,
      recovery_rate: recoveryRate,
      time_span_days: timeSpanDays,
    };
  }
}

