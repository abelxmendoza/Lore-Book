import { randomUUID } from 'crypto';

import { DistortionClassifier } from './distortionClassifier';
import { DistortionExtractor } from './distortionExtractor';
import { DistortionNarrative } from './distortionNarrative';
import type { DistortionNarrativeResult } from './distortionNarrative';
import { DistortionScore } from './distortionScore';
import type { DistortionScoreResult } from './distortionScore';
import type { DistortionSignal, DistortionType } from './distortionTypes';

export interface DistortionEngineResult {
  signals: DistortionSignal[];
  score: DistortionScoreResult;
  narrative: DistortionNarrativeResult;
}

export class DistortionEngine {
  private extractor: DistortionExtractor;
  private classifier: DistortionClassifier;
  private scorer: DistortionScore;
  private narrative: DistortionNarrative;

  constructor() {
    this.extractor = new DistortionExtractor();
    this.classifier = new DistortionClassifier();
    this.scorer = new DistortionScore();
    this.narrative = new DistortionNarrative();
  }

  async process(ctx: { entries: any[] }): Promise<DistortionEngineResult> {
    const keywordSignals = this.extractor.extract(ctx.entries);

    const semanticSignals: DistortionSignal[] = [];
    for (const e of ctx.entries) {
      const text = e.content || e.summary || '';
      if (!text) continue;

      const out = await this.classifier.classify(text);
      for (const d of out.distortions) {
        semanticSignals.push({
          id: randomUUID(),
          type: d.type as DistortionType,
          evidence: text,
          timestamp: e.date,
          severity: e.mood ? 0.4 : 0.5,
          confidence: d.confidence,
          triggerPhrase: 'semantic',
        });
      }
    }

    const allSignals = [...keywordSignals, ...semanticSignals];
    const score = this.scorer.compute(allSignals);
    const narrative = await this.narrative.build(allSignals, score);

    return { signals: allSignals, score, narrative };
  }
}

