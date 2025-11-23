import { logger } from '../../logger';
import type { CreativeEvent, FlowState, CreativeCycle, CreativeCycleType } from './types';

/**
 * Detects creative cycles (productivity, inspiration, execution)
 */
export class CreativeCycleDetector {
  /**
   * Detect creative cycles
   */
  detect(events: CreativeEvent[], flow: FlowState[]): CreativeCycle[] {
    const cycles: CreativeCycle[] = [];

    try {
      if (events.length < 4) {
        // Not enough data for cycle detection
        return cycles;
      }

      // Detect productivity cycle
      const productivityCycle = this.detectProductivityCycle(events);
      if (productivityCycle) {
        cycles.push(productivityCycle);
      }

      // Detect inspiration cycle
      const inspirationCycle = this.detectInspirationCycle(events);
      if (inspirationCycle) {
        cycles.push(inspirationCycle);
      }

      // Detect execution cycle (based on flow states)
      const executionCycle = this.detectExecutionCycle(flow);
      if (executionCycle) {
        cycles.push(executionCycle);
      }

      logger.debug({ cycles: cycles.length }, 'Detected creative cycles');

      return cycles;
    } catch (error) {
      logger.error({ error }, 'Failed to detect creative cycles');
      return [];
    }
  }

  /**
   * Detect productivity cycle
   */
  private detectProductivityCycle(events: CreativeEvent[]): CreativeCycle | null {
    if (events.length < 4) return null;

    // Sort by timestamp
    const sorted = [...events].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    // Group by week
    const byWeek: Record<string, CreativeEvent[]> = {};

    for (const event of sorted) {
      const week = this.getWeekKey(event.timestamp);
      if (!byWeek[week]) {
        byWeek[week] = [];
      }
      byWeek[week].push(event);
    }

    const weeks = Object.keys(byWeek).sort();
    if (weeks.length < 2) return null;

    // Detect phases
    const phases = {
      rising: [] as string[],
      peak: [] as string[],
      falling: [] as string[],
      rest: [] as string[],
    };

    const weekCounts = weeks.map(w => byWeek[w].length);
    const maxCount = Math.max(...weekCounts);
    const minCount = Math.min(...weekCounts);
    const avgCount = weekCounts.reduce((sum, c) => sum + c, 0) / weekCounts.length;

    for (let i = 0; i < weeks.length; i++) {
      const count = weekCounts[i];
      const week = weeks[i];

      if (count === maxCount) {
        phases.peak.push(week);
      } else if (count > avgCount && i > 0 && weekCounts[i - 1] < count) {
        phases.rising.push(week);
      } else if (count < avgCount && i > 0 && weekCounts[i - 1] > count) {
        phases.falling.push(week);
      } else if (count === minCount || count < avgCount * 0.5) {
        phases.rest.push(week);
      }
    }

    return {
      cycleType: 'productivity',
      phases,
      period_days: weeks.length * 7,
      confidence: 0.6,
    };
  }

  /**
   * Detect inspiration cycle
   */
  private detectInspirationCycle(events: CreativeEvent[]): CreativeCycle | null {
    // Simplified - would need more sophisticated analysis
    // For now, detect based on frequency of "planned" and "thought_about" actions
    const inspirationEvents = events.filter(e => e.action === 'planned' || e.action === 'thought_about');

    if (inspirationEvents.length < 3) return null;

    // Group by week
    const byWeek: Record<string, CreativeEvent[]> = {};

    for (const event of inspirationEvents) {
      const week = this.getWeekKey(event.timestamp);
      if (!byWeek[week]) {
        byWeek[week] = [];
      }
      byWeek[week].push(event);
    }

    const weeks = Object.keys(byWeek).sort();
    if (weeks.length < 2) return null;

    const phases = {
      rising: [] as string[],
      peak: [] as string[],
      falling: [] as string[],
      rest: [] as string[],
    };

    // Simple phase detection
    const weekCounts = weeks.map(w => byWeek[w].length);
    const maxCount = Math.max(...weekCounts);

    weeks.forEach((week, i) => {
      const count = weekCounts[i];
      if (count === maxCount) {
        phases.peak.push(week);
      } else if (count > 0) {
        phases.rising.push(week);
      } else {
        phases.rest.push(week);
      }
    });

    return {
      cycleType: 'inspiration',
      phases,
      period_days: weeks.length * 7,
      confidence: 0.5,
    };
  }

  /**
   * Detect execution cycle (based on flow states)
   */
  private detectExecutionCycle(flow: FlowState[]): CreativeCycle | null {
    if (flow.length < 3) return null;

    // Sort by timestamp
    const sorted = [...flow].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    // Group by week
    const byWeek: Record<string, FlowState[]> = {};

    for (const state of sorted) {
      const week = this.getWeekKey(state.timestamp);
      if (!byWeek[week]) {
        byWeek[week] = [];
      }
      byWeek[week].push(state);
    }

    const weeks = Object.keys(byWeek).sort();
    if (weeks.length < 2) return null;

    const phases = {
      rising: [] as string[],
      peak: [] as string[],
      falling: [] as string[],
      rest: [] as string[],
    };

    const weekAverages = weeks.map(w => {
      const states = byWeek[w];
      return states.reduce((sum, s) => sum + s.level, 0) / states.length;
    });

    const maxAvg = Math.max(...weekAverages);
    const minAvg = Math.min(...weekAverages);
    const avgAvg = weekAverages.reduce((sum, a) => sum + a, 0) / weekAverages.length;

    weeks.forEach((week, i) => {
      const avg = weekAverages[i];
      if (avg === maxAvg) {
        phases.peak.push(week);
      } else if (avg > avgAvg && i > 0 && weekAverages[i - 1] < avg) {
        phases.rising.push(week);
      } else if (avg < avgAvg && i > 0 && weekAverages[i - 1] > avg) {
        phases.falling.push(week);
      } else if (avg === minAvg || avg < avgAvg * 0.7) {
        phases.rest.push(week);
      }
    });

    return {
      cycleType: 'execution',
      phases,
      period_days: weeks.length * 7,
      confidence: 0.6,
    };
  }

  /**
   * Get week key from timestamp
   */
  private getWeekKey(timestamp: string): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const week = Math.floor(date.getTime() / (1000 * 60 * 60 * 24 * 7));
    return `${year}-W${week}`;
  }
}

