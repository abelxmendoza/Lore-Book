import { randomUUID } from 'crypto';

import type { MemoryEntry } from '../../types';
import type { InnerVoice } from './types';

export class DialogueExtractor {
  private patterns = [
    { role: 'critic', regex: /(i messed up|i'm dumb|why did i|i shouldn't have)/i },
    { role: 'coach', regex: /(i can do this|let's keep going|one more round)/i },
    { role: 'warrior', regex: /(push harder|no fear|take the hit|stand tall)/i },
    { role: 'shadow', regex: /(i hate that i|dark part of me|i want to break stuff)/i },
    { role: 'skeptic', regex: /(is this even worth it|what if it fails)/i },
    { role: 'hype', regex: /(i'm him|let's go|i got this|i'm built for this)/i },
    { role: 'mentor', regex: /(remember what you learned|stay disciplined)/i },
    { role: 'child_self', regex: /(i feel small|i'm scared|i need someone)/i },
    { role: 'future_self', regex: /(the man i'm becoming|future me will|when i'm successful)/i },
  ];

  extract(entries: MemoryEntry[]): InnerVoice[] {
    const out: InnerVoice[] = [];

    entries.forEach((e) => {
      const text = e.content || e.summary || '';
      this.patterns.forEach((p) => {
        if (p.regex.test(text)) {
          out.push({
            id: randomUUID(),
            text: text,
            timestamp: e.date,
            role: p.role as InnerVoice['role'],
            tone: 'neutral',
            confidence: 0.7,
          });
        }
      });
    });

    return out;
  }
}

