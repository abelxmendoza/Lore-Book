import type { DistortionSignal, DistortionType } from './distortionTypes';

export interface DistortionScoreResult {
  severity: number;
  dominantDistortion: DistortionType | null;
  distortionCounts: Record<string, number>;
}

export class DistortionScore {
  compute(signals: DistortionSignal[]): DistortionScoreResult {
    if (signals.length === 0) {
      return {
        severity: 0,
        dominantDistortion: null,
        distortionCounts: {},
      };
    }

    const severityAvg = signals.reduce((a, b) => a + b.severity, 0) / signals.length;

    const typeCounts: Record<string, number> = {};
    for (const s of signals) {
      typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1;
    }

    const peakType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as DistortionType | undefined;

    return {
      severity: severityAvg,
      dominantDistortion: peakType || null,
      distortionCounts: typeCounts,
    };
  }
}

