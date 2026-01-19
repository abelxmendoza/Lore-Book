import { ToneClassifier } from './classifyTone';
import { VoiceClusterer } from './clusterVoices';
import { DialogueExtractor } from './extractVoices';
import { RoleMapping } from './roleMapping';
import type { InnerDialogueModel } from './types';

export class InnerDialogueEngine {
  private extractor: DialogueExtractor;
  private tone: ToneClassifier;
  private role: RoleMapping;
  private clusterer: VoiceClusterer;

  constructor() {
    this.extractor = new DialogueExtractor();
    this.tone = new ToneClassifier();
    this.role = new RoleMapping();
    this.clusterer = new VoiceClusterer();
  }

  async process(ctx: { entries: any[] }): Promise<InnerDialogueModel> {
    const signals = this.extractor.extract(ctx.entries);

    const toned = signals.map((s) => ({
      ...s,
      tone: this.tone.detectTone(s.text),
    }));

    const refined = toned.map((s) => this.role.refineRole(s));

    const clusters = await this.clusterer.cluster(refined);

    return {
      voices: refined,
      clusters,
    };
  }
}

