import type { BiasSignal } from './types';

export class BiasImpact {
  compute(signals: BiasSignal[]): number {
    if (signals.length === 0) return 0;

    const avgWeight = signals.reduce((a, b) => a + (b.weight || 0), 0) / signals.length;

    return Math.min(1, avgWeight);
  }
}

