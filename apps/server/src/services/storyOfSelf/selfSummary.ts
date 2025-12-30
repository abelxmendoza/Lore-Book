import type { NarrativeMode, SelfTheme, StoryArcSegment, TurningPoint } from './types';

export class StoryOfSelfSummary {
  build(
    themes: SelfTheme[],
    tps: TurningPoint[],
    mode: NarrativeMode,
    arcs: StoryArcSegment[]
  ): string {
    return `
Your Story of Self is driven by:

Themes:
${themes.map((t) => `• ${t.theme}`).join('\n')}

Major Turning Points:
${tps
  .slice(0, 5)
  .map((t) => `• (${t.category}) ${t.description.slice(0, 100)}`)
  .join('\n')}

Narrative Mode:
→ ${mode.mode} (confidence ${mode.confidence.toFixed(2)})

Arcs:
${arcs.map((a) => `• ${a.title}`).join('\n')}
`.trim();
  }
}

