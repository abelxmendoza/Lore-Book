import { randomUUID } from 'crypto';

import type { MemoryEntry } from '../../types';
import { biasPatterns } from './biasPatterns';
import type { BiasSignal } from './types';

export class BiasExtractor {
  extract(entries: MemoryEntry[]): BiasSignal[] {
    const out: BiasSignal[] = [];

    entries.forEach((e) => {
      const text = e.content || e.summary || '';
      biasPatterns.forEach((p) => {
        if (p.regex.test(text)) {
          out.push({
            id: randomUUID(),
            biasType: p.type,
            text: text,
            timestamp: e.date,
            evidence: p.regex.toString(),
            confidence: 0.7,
          });
        }
      });
    });

    return out;
  }
}

