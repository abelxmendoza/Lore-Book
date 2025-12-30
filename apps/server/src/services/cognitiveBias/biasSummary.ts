import type { BiasSignal, BiasType } from './types';

export class BiasSummary {
  build(signals: BiasSignal[], impact: number): string {
    const counts = this.countByType(signals);
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    return `
Dominant Bias: ${dominant ? dominant[0] : 'None'}
Bias Impact Score: ${(impact * 100).toFixed(1)}%

Top Detected Biases:
${Object.entries(counts)
  .map(([t, n]) => `• ${t}: ${n}`)
  .join('\n')}
    `.trim();
  }

  countByType(signals: BiasSignal[]): Record<string, number> {
    const out: Record<string, number> = {};
    signals.forEach((s) => {
      out[s.biasType] = (out[s.biasType] || 0) + 1;
    });
    return out;
  }
}

