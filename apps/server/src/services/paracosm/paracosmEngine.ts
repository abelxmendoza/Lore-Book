import { randomUUID } from 'crypto';

import { ParacosmCategorizer } from './categorize';
import { ParacosmClusterer } from './clusterParacosms';
import { ParacosmSignalExtractor } from './extractSignals';
import type { ParacosmModel } from './types';

export class ParacosmEngine {
  private extractor: ParacosmSignalExtractor;
  private categorizer: ParacosmCategorizer;
  private clusterer: ParacosmClusterer;

  constructor() {
    this.extractor = new ParacosmSignalExtractor();
    this.categorizer = new ParacosmCategorizer();
    this.clusterer = new ParacosmClusterer();
  }

  async process(ctx: { entries: any[] }): Promise<ParacosmModel> {
    const entries = ctx.entries;

    const signals = this.extractor.extract(entries);
    const normalized = this.categorizer.normalize(signals);
    const clusters = await this.clusterer.cluster(normalized);

    return {
      id: randomUUID(),
      signals: normalized,
      clusters,
    };
  }
}

