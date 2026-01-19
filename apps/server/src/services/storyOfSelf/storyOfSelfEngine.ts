import { randomUUID } from 'crypto';

import type { MemoryEntry } from '../../types';

import { StoryArcAssembler } from './selfArcAssembler';
import { StoryCoherenceAnalyzer } from './selfCoherence';
import { NarrativeModeExtractor } from './selfNarrativeModes';
import { StoryOfSelfSummary } from './selfSummary';
import { SelfThemeExtractor } from './selfThemes';
import { TurningPointDetector } from './selfTurningPoints';
import { VoicePrintExtractor } from './selfVoiceExtractor';
import type { StoryOfSelf } from './types';

export interface StoryOfSelfContext {
  entries: MemoryEntry[];
}

export class StoryOfSelfEngine {
  private themes: SelfThemeExtractor;
  private tps: TurningPointDetector;
  private mode: NarrativeModeExtractor;
  private arcs: StoryArcAssembler;
  private coherence: StoryCoherenceAnalyzer;
  private voice: VoicePrintExtractor;
  private summary: StoryOfSelfSummary;

  constructor() {
    this.themes = new SelfThemeExtractor();
    this.tps = new TurningPointDetector();
    this.mode = new NarrativeModeExtractor();
    this.arcs = new StoryArcAssembler();
    this.coherence = new StoryCoherenceAnalyzer();
    this.voice = new VoicePrintExtractor();
    this.summary = new StoryOfSelfSummary();
  }

  async process(ctx: StoryOfSelfContext): Promise<StoryOfSelf> {
    const entries = ctx.entries;

    const themes = this.themes.extract(entries);
    const tps = this.tps.extract(entries);
    const mode = this.mode.infer(themes);
    const arcs = this.arcs.assemble(themes, tps);
    const coherence = this.coherence.compute(themes, tps);
    const voice = this.voice.extract(entries);
    const summary = this.summary.build(themes, tps, mode, arcs);

    return {
      id: randomUUID(),
      themes,
      turningPoints: tps,
      mode,
      arcs,
      coherence,
      voicePrint: voice,
      summary,
    };
  }
}

