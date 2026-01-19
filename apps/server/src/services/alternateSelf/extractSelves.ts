import { randomUUID } from 'crypto';

import type { MemoryEntry } from '../../types';

import type { SelfStatement, SelfType } from './types';

export class SelfExtractor {
  private patterns = [
    { type: 'past_self', regex: /(i used to be|back then|who i was|old me)/i },
    { type: 'future_self', regex: /(i will become|future me|the man i'm becoming)/i },
    { type: 'ideal_self', regex: /(i want to be|my best self|ideal me)/i },
    { type: 'shadow_self', regex: /(dark side of me|i hate that part|my worst self)/i },
    { type: 'feared_self', regex: /(i'm scared i'll become|i don't want to turn into)/i },
    { type: 'public_self', regex: /(around people i|in public i act)/i },
    { type: 'private_self', regex: /(when i'm alone|privately i)/i },
    { type: 'relationship_self', regex: /(in relationships i|with her i am)/i },
    { type: 'warrior_self', regex: /(when i fight|warrior mode|i feel like a fighter)/i },
    { type: 'creator_self', regex: /(when i create|artist side of me|builder in me)/i },
    { type: 'healed_self', regex: /(i'm healing|i feel recovered|better version)/i },
    { type: 'broken_self', regex: /(i feel broken|part of me is damaged)/i },
  ];

  extract(entries: MemoryEntry[]): SelfStatement[] {
    const results: SelfStatement[] = [];

    entries.forEach((e) => {
      const text = e.content || e.summary || '';
      this.patterns.forEach((p) => {
        if (p.regex.test(text)) {
          results.push({
            id: randomUUID(),
            text: text,
            timestamp: e.date,
            selfType: p.type as SelfType,
            confidence: 0.7,
          });
        }
      });
    });

    return results;
  }
}

