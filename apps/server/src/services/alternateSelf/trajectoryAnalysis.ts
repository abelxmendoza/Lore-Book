import type { SelfStatement, SelfTrajectory, SelfType } from './types';

export class TrajectoryAnalyzer {
  compute(selves: SelfStatement[]): SelfTrajectory {
    const counts: Record<string, number> = selves.reduce(
      (acc, s) => {
        acc[s.selfType] = (acc[s.selfType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const dominantSelf = (sorted[0]?.[0] || 'unknown') as SelfType;

    return {
      dominantSelf,
      risingSelves: sorted.slice(1, 3).map(([t]) => t as SelfType),
      fadingSelves: sorted.slice(-2).map(([t]) => t as SelfType),
      volatility: this.computeVolatility(selves),
    };
  }

  private computeVolatility(selves: SelfStatement[]): number {
    return Math.min(1, selves.length / 50);
  }
}

