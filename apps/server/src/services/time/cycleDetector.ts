import { logger } from '../../logger';
import type { TimeEvent, TimeCycle, TimeCycleType } from './types';

/**
 * Detects time cycles (productivity, fatigue, focus, workload)
 */
export class TimeCycleDetector {
  /**
   * Detect time cycles
   */
  detect(events: TimeEvent[]): TimeCycle[] {
    const cycles: TimeCycle[] = [];

    try {
      if (events.length < 4) {
        return cycles;
      }

      // Detect productivity cycle
      const productivityCycle = this.detectProductivityCycle(events);
      if (productivityCycle) {
        cycles.push(productivityCycle);
      }

      // Detect focus cycle
      const focusCycle = this.detectFocusCycle(events);
      if (focusCycle) {
        cycles.push(focusCycle);
      }

      // Detect workload cycle
      const workloadCycle = this.detectWorkloadCycle(events);
      if (workloadCycle) {
        cycles.push(workloadCycle);
      }

      logger.debug({ cycles: cycles.length }, 'Detected time cycles');

      return cycles;
    } catch (error) {
      logger.error({ error }, 'Failed to detect time cycles');
      return [];
    }
  }

  /**
   * Detect productivity cycle
   */
  private detectProductivityCycle(events: TimeEvent[]): TimeCycle | null {
    if (events.length < 4) return null;

    // Group by week
    const byWeek: Record<string, TimeEvent[]> = {};

    for (const event of events) {
      const week = this.getWeekKey(event.timestamp);
      if (!byWeek[week]) {
        byWeek[week] = [];
      }
      byWeek[week].push(event);
    }

    const weeks = Object.keys(byWeek).sort();
    if (weeks.length < 2) return null;

    // Productive categories
    const productiveCategories = ['coding', 'robotics', 'work', 'learning', 'gym', 'bjj', 'muay_thai'];

    // Detect phases
    const phases = {
      rising: [] as string[],
      peak: [] as string[],
      falling: [] as string[],
      rest: [] as string[],
    };

    const weekProductivity = weeks.map(week => {
      const weekEvents = byWeek[week];
      return weekEvents.filter(e => productiveCategories.includes(e.category)).length;
    });

    const maxProductivity = Math.max(...weekProductivity);
    const minProductivity = Math.min(...weekProductivity);
    const avgProductivity = weekProductivity.reduce((sum, p) => sum + p, 0) / weekProductivity.length;

    for (let i = 0; i < weeks.length; i++) {
      const productivity = weekProductivity[i];
      const week = weeks[i];

      if (productivity === maxProductivity) {
        phases.peak.push(week);
      } else if (productivity > avgProductivity && i > 0 && weekProductivity[i - 1] < productivity) {
        phases.rising.push(week);
      } else if (productivity < avgProductivity && i > 0 && weekProductivity[i - 1] > productivity) {
        phases.falling.push(week);
      } else if (productivity === minProductivity || productivity < avgProductivity * 0.5) {
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
   * Detect focus cycle
   */
  private detectFocusCycle(events: TimeEvent[]): TimeCycle | null {
    if (events.length < 4) return null;

    // Focus categories (deep work)
    const focusCategories = ['coding', 'robotics', 'learning'];

    // Group by day
    const byDay: Record<string, TimeEvent[]> = {};

    for (const event of events) {
      const day = new Date(event.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = [];
      }
      byDay[day].push(event);
    }

    const days = Object.keys(byDay).sort();
    if (days.length < 3) return null;

    const phases = {
      rising: [] as string[],
      peak: [] as string[],
      falling: [] as string[],
      rest: [] as string[],
    };

    const dayFocus = days.map(day => {
      const dayEvents = byDay[day];
      return dayEvents.filter(e => focusCategories.includes(e.category)).length;
    });

    const maxFocus = Math.max(...dayFocus);
    const avgFocus = dayFocus.reduce((sum, f) => sum + f, 0) / dayFocus.length;

    for (let i = 0; i < days.length; i++) {
      const focus = dayFocus[i];
      const day = days[i];

      if (focus === maxFocus) {
        phases.peak.push(day);
      } else if (focus > avgFocus && i > 0 && dayFocus[i - 1] < focus) {
        phases.rising.push(day);
      } else if (focus < avgFocus && i > 0 && dayFocus[i - 1] > focus) {
        phases.falling.push(day);
      } else if (focus === 0 || focus < avgFocus * 0.3) {
        phases.rest.push(day);
      }
    }

    return {
      cycleType: 'focus',
      phases,
      period_days: days.length,
      confidence: 0.5,
    };
  }

  /**
   * Detect workload cycle
   */
  private detectWorkloadCycle(events: TimeEvent[]): TimeCycle | null {
    if (events.length < 4) return null;

    // Group by week
    const byWeek: Record<string, TimeEvent[]> = {};

    for (const event of events) {
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

    const weekCounts = weeks.map(week => byWeek[week].length);
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
      cycleType: 'workload',
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

