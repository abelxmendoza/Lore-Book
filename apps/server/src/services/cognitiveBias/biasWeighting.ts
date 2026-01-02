import type { BiasSignal, BiasType } from './types';

export class BiasWeighting {
  compute(signals: BiasSignal[]): BiasSignal[] {
    return signals.map((s) => ({
      ...s,
      weight: this.weightBias(s.biasType),
    }));
  }

  private weightBias(bias: BiasType): number {
    const weights: Record<BiasType, number> = {
      catastrophizing: 1.0,
      mind_reading: 0.9,
      black_white_thinking: 0.8,
      overgeneralization: 0.7,
      personalization: 0.6,
      emotional_reasoning: 0.6,
      negativity_bias: 0.8,
      halo_effect: 0.5,
      spotlight_effect: 0.5,
      self_serving_bias: 0.4,
      optimism_bias: 0.4,
      projection: 0.5,
      confirmation_bias: 0.3,
      unknown: 0.2,
    };

    return weights[bias] ?? 0.2;
  }
}

