import { SelfTypeClassifier } from './classifySelfType';
import { SelfClusterer } from './clusterSelves';
import { SelfExtractor } from './extractSelves';
import { TrajectoryAnalyzer } from './trajectoryAnalysis';
import type { AlternateSelfModel } from './types';

export class AlternateSelfEngine {
  private extractor: SelfExtractor;
  private classifier: SelfTypeClassifier;
  private clusterer: SelfClusterer;
  private trajectory: TrajectoryAnalyzer;

  constructor() {
    this.extractor = new SelfExtractor();
    this.classifier = new SelfTypeClassifier();
    this.clusterer = new SelfClusterer();
    this.trajectory = new TrajectoryAnalyzer();
  }

  async process(ctx: { entries: any[] }): Promise<AlternateSelfModel> {
    const raw = this.extractor.extract(ctx.entries);

    const refined = raw.map((s) => this.classifier.refineSelfType(s));

    const clusters = await this.clusterer.cluster(refined);

    const trajectory = this.trajectory.compute(refined);

    return {
      selves: refined,
      clusters,
      trajectory,
    };
  }
}

