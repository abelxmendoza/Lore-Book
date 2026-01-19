import { randomUUID } from 'crypto';

import type { MemoryEntry } from '../../types';

import { DISTORTION_PATTERNS } from './distortionPatterns';
import type { DistortionSignal } from './distortionTypes';

export class DistortionExtractor {
  extract(entries: MemoryEntry[]): DistortionSignal[] {
    const out: DistortionSignal[] = [];

    for (const e of entries) {
      const text = e.content || e.summary || '';
      for (const group of DISTORTION_PATTERNS) {
        for (const p of group.patterns) {
          if (p.test(text)) {
            // Calculate severity from mood if available, otherwise use default
            let severity = 0.4;
            if (e.mood) {
              const highSeverityMoods = ['angry', 'sad', 'anxious', 'fearful', 'ashamed'];
              severity = highSeverityMoods.includes(e.mood.toLowerCase()) ? 0.7 : 0.4;
            }
            severity = Math.min(1, severity + 0.3);

            out.push({
              id: randomUUID(),
              type: group.type,
              triggerPhrase: p.source,
              evidence: text,
              timestamp: e.date,
              severity,
              confidence: 0.8,
            });
          }
        }
      }
    }

    return out;
  }
}

