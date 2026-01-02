import type { SelfTheme, StoryArcSegment, TurningPoint } from './types';

export class StoryArcAssembler {
  assemble(themes: SelfTheme[], tps: TurningPoint[]): StoryArcSegment[] {
    // super simple grouping by timestamp clusters
    const grouped: Record<string, TurningPoint[]> = {};

    tps.forEach((tp) => {
      const era = tp.timestamp.split('-')[0]; // group by year for simplicity
      grouped[era] = grouped[era] || [];
      grouped[era].push(tp);
    });

    return Object.entries(grouped).map(([era, events]) => ({
      title: `Era of ${era}`,
      era,
      content: events.map((e) => e.description).join('\n'),
      themes: themes.map((t) => t.theme),
    }));
  }
}

