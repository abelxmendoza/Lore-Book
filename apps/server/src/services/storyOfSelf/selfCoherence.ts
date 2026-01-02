import type { SelfTheme, StoryCoherence, TurningPoint } from './types';

export class StoryCoherenceAnalyzer {
  compute(themes: SelfTheme[], tps: TurningPoint[]): StoryCoherence {
    const contradictions: string[] = [];
    const missingPieces: string[] = [];

    // find contradictions: opposing themes with similar strength
    const pairs: [string, string][] = [
      ['survival', 'self_worth'],
      ['rebirth', 'fall'],
      ['connection', 'outsider'],
      ['shadow', 'purpose'],
    ];

    pairs.forEach(([a, b]) => {
      const A = themes.find((t) => t.theme === a);
      const B = themes.find((t) => t.theme === b);

      if (A && B && Math.abs(A.strength - B.strength) < 0.2) {
        contradictions.push(`${a} vs ${b}`);
      }
    });

    if (tps.length < 5) {
      missingPieces.push('Not enough major turning points detected');
    }

    return {
      coherenceScore: Math.max(0.2, 1 - contradictions.length * 0.1),
      contradictions,
      missingPieces,
    };
  }
}

