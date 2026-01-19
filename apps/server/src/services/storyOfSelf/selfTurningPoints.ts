import { randomUUID } from 'crypto';

import type { MemoryEntry } from '../../types';

import type { TurningPoint } from './types';

export class TurningPointDetector {
  extract(entries: MemoryEntry[]): TurningPoint[] {
    const tps: TurningPoint[] = [];

    const patterns = [
      { cat: 'trauma', regex: /(hurt me|betrayed|lost|got kicked out|attacked)/i },
      { cat: 'victory', regex: /(won|succeeded|achieved|landed|earned)/i },
      { cat: 'awakening', regex: /(realized|eye opener|truth hit|wake up)/i },
      { cat: 'shift', regex: /(change of path|new direction|pivot)/i },
      { cat: 'fall', regex: /(down bad|failure|collapsed)/i },
      { cat: 'rise', regex: /(rising|comeback|level up)/i },
      { cat: 'betrayal', regex: /(stabbed in the back|fake|snake)/i },
      { cat: 'breakthrough', regex: /(breakthrough|moment clicked|epiphany)/i },
    ];

    entries.forEach((e) => {
      const text = e.content || e.summary || '';
      patterns.forEach((p) => {
        if (p.regex.test(text)) {
          // Calculate emotional impact from mood if available, otherwise use a default
          let emotionalImpact = 0.5;
          if (e.mood) {
            // Map mood to emotional impact (simplified)
            const highImpactMoods = ['angry', 'sad', 'excited', 'anxious', 'fearful'];
            emotionalImpact = highImpactMoods.includes(e.mood.toLowerCase()) ? 0.8 : 0.5;
          }

          tps.push({
            id: randomUUID(),
            timestamp: e.date,
            description: text,
            category: p.cat as TurningPoint['category'],
            emotionalImpact: Math.min(1, emotionalImpact),
          });
        }
      });
    });

    return tps;
  }
}

