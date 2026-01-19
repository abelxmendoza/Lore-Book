import { BiasClassifier } from './biasClassifier';
import { BiasExtractor } from './biasExtractor';
import { BiasImpact } from './biasImpact';
import { BiasSummary } from './biasSummary';
import { BiasWeighting } from './biasWeighting';
import type { BiasProfile, BiasSignal, BiasType } from './types';

export class CognitiveBiasEngine {
  private extractor: BiasExtractor;
  private classifier: BiasClassifier;
  private weighting: BiasWeighting;
  private impact: BiasImpact;
  private summary: BiasSummary;

  constructor() {
    this.extractor = new BiasExtractor();
    this.classifier = new BiasClassifier();
    this.weighting = new BiasWeighting();
    this.impact = new BiasImpact();
    this.summary = new BiasSummary();
  }

  async process(ctx: { entries: any[] }): Promise<BiasProfile> {
    const raw = this.extractor.extract(ctx.entries);
    const refined = raw.map((r) => this.classifier.refine(r));
    const weighted = this.weighting.compute(refined);
    const impact = this.impact.compute(weighted);
    const summary = this.summary.build(weighted, impact);

    return {
      dominantBiases: this.getDominant(weighted),
      allBiases: weighted,
      impactScore: impact,
      summary,
    };
  }

  private getDominant(signals: BiasSignal[]): BiasType[] {
    const counts: Record<string, number> = signals.reduce(
      (acc, s) => {
        acc[s.biasType] = (acc[s.biasType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t as BiasType);
  }
}

