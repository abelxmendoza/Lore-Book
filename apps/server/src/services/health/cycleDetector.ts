import { logger } from '../../logger';

import type { WellnessCycle, EnergyEvent, SymptomEvent, SleepEvent } from './types';

/**
 * Detects wellness cycles (stress, energy, mood, physical)
 */
export class CycleDetector {
  /**
   * Detect wellness cycles
   */
  detect(
    energy: EnergyEvent[],
    symptoms: SymptomEvent[],
    sleep: SleepEvent[]
  ): WellnessCycle[] {
    const cycles: WellnessCycle[] = [];

    try {
      // Sort all events by timestamp
      const allEvents = [
        ...energy.map(e => ({ type: 'energy' as const, timestamp: e.timestamp, value: e.level })),
        ...symptoms.map(s => ({ type: 'symptom' as const, timestamp: s.timestamp, value: s.intensity })),
        ...sleep.map(s => ({ type: 'sleep' as const, timestamp: s.timestamp, value: s.quality || s.hours || 0 })),
      ].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      if (allEvents.length < 4) {
        // Not enough data for cycle detection
        return cycles;
      }

      // Detect physical cycle (energy + symptoms)
      const physicalCycle = this.detectPhysicalCycle(energy, symptoms);
      if (physicalCycle) {
        cycles.push(physicalCycle);
      }

      // Detect energy cycle
      const energyCycle = this.detectEnergyCycle(energy);
      if (energyCycle) {
        cycles.push(energyCycle);
      }

      // Detect stress cycle (from symptoms)
      const stressCycle = this.detectStressCycle(symptoms);
      if (stressCycle) {
        cycles.push(stressCycle);
      }

      logger.debug({ cycles: cycles.length }, 'Detected wellness cycles');

      return cycles;
    } catch (error) {
      logger.error({ error }, 'Failed to detect wellness cycles');
      return [];
    }
  }

  /**
   * Detect physical wellness cycle
   */
  private detectPhysicalCycle(
    energy: EnergyEvent[],
    symptoms: SymptomEvent[]
  ): WellnessCycle | null {
    if (energy.length < 3 || symptoms.length < 2) return null;

    // Group by week to detect patterns
    const byWeek: Record<string, { energy: number[]; symptoms: number[] }> = {};

    for (const e of energy) {
      const week = this.getWeekKey(e.timestamp);
      if (!byWeek[week]) {
        byWeek[week] = { energy: [], symptoms: [] };
      }
      byWeek[week].energy.push(e.level);
    }

    for (const s of symptoms) {
      const week = this.getWeekKey(s.timestamp);
      if (!byWeek[week]) {
        byWeek[week] = { energy: [], symptoms: [] };
      }
      byWeek[week].symptoms.push(s.intensity);
    }

    const weeks = Object.keys(byWeek).sort();
    if (weeks.length < 2) return null;

    // Detect rising/peak/falling/recovery phases
    const phases = {
      rising: [] as string[],
      peak: [] as string[],
      falling: [] as string[],
      recovery: [] as string[],
    };

    for (let i = 0; i < weeks.length; i++) {
      const week = weeks[i];
      const data = byWeek[week];
      const avgEnergy = data.energy.length > 0
        ? data.energy.reduce((sum, e) => sum + e, 0) / data.energy.length
        : 0.5;
      const avgSymptoms = data.symptoms.length > 0
        ? data.symptoms.reduce((sum, s) => sum + s, 0) / data.symptoms.length
        : 0.3;

      const wellness = avgEnergy - avgSymptoms;

      if (i === 0 || wellness > this.getPreviousWellness(weeks, byWeek, i - 1)) {
        phases.rising.push(week);
      } else if (wellness > 0.6) {
        phases.peak.push(week);
      } else if (wellness < -0.2) {
        phases.falling.push(week);
      } else {
        phases.recovery.push(week);
      }
    }

    return {
      cycleType: 'physical',
      phases,
      period_days: weeks.length * 7,
      confidence: 0.6,
    };
  }

  /**
   * Detect energy cycle
   */
  private detectEnergyCycle(energy: EnergyEvent[]): WellnessCycle | null {
    if (energy.length < 4) return null;

    // Sort by timestamp
    const sorted = [...energy].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    // Detect phases based on energy levels
    const phases = {
      rising: [] as string[],
      peak: [] as string[],
      falling: [] as string[],
      recovery: [] as string[],
    };

    for (let i = 0; i < sorted.length; i++) {
      const event = sorted[i];
      const level = event.level;

      if (i === 0 || level > sorted[i - 1].level) {
        phases.rising.push(event.timestamp);
      } else if (level > 0.7) {
        phases.peak.push(event.timestamp);
      } else if (level < sorted[i - 1].level) {
        phases.falling.push(event.timestamp);
      } else {
        phases.recovery.push(event.timestamp);
      }
    }

    return {
      cycleType: 'energy',
      phases,
      confidence: 0.5,
    };
  }

  /**
   * Detect stress cycle
   */
  private detectStressCycle(symptoms: SymptomEvent[]): WellnessCycle | null {
    if (symptoms.length < 3) return null;

    // Filter stress-related symptoms
    const stressSymptoms = symptoms.filter(s =>
      s.type === 'stress_somatic' || s.type === 'fatigue' || s.type === 'sleep_issue'
    );

    if (stressSymptoms.length < 2) return null;

    // Sort by timestamp
    const sorted = [...stressSymptoms].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    const phases = {
      rising: [] as string[],
      peak: [] as string[],
      falling: [] as string[],
      recovery: [] as string[],
    };

    for (let i = 0; i < sorted.length; i++) {
      const event = sorted[i];
      const intensity = event.intensity;

      if (i === 0 || intensity > sorted[i - 1].intensity) {
        phases.rising.push(event.timestamp);
      } else if (intensity > 0.7) {
        phases.peak.push(event.timestamp);
      } else if (intensity < sorted[i - 1].intensity) {
        phases.falling.push(event.timestamp);
      } else {
        phases.recovery.push(event.timestamp);
      }
    }

    return {
      cycleType: 'stress',
      phases,
      confidence: 0.5,
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

  /**
   * Get previous week's wellness
   */
  private getPreviousWellness(
    weeks: string[],
    byWeek: Record<string, { energy: number[]; symptoms: number[] }>,
    index: number
  ): number {
    if (index < 0) return 0.5;

    const week = weeks[index];
    const data = byWeek[week];
    const avgEnergy = data.energy.length > 0
      ? data.energy.reduce((sum, e) => sum + e, 0) / data.energy.length
      : 0.5;
    const avgSymptoms = data.symptoms.length > 0
      ? data.symptoms.reduce((sum, s) => sum + s, 0) / data.symptoms.length
      : 0.3;

    return avgEnergy - avgSymptoms;
  }
}

