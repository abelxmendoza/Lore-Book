import { randomUUID } from 'crypto';

import type { MemoryEntry } from '../../types';
import type { ParacosmSignal } from './types';

export class ParacosmSignalExtractor {
  patterns = [
    { cat: 'imagined_person', regex: /(someone i haven't met|some girl|this influencer|this creator)/i },
    { cat: 'imagined_group', regex: /(their friend group|these people i might meet)/i },
    { cat: 'future_scenario', regex: /(i imagine|i picture|i can see myself|in the future|what if)/i },
    { cat: 'alternate_self', regex: /(my other self|alternate version|if i was|if i became)/i },
    { cat: 'fantasy_world', regex: /(fictional world|universe|if reality was)/i },
    { cat: 'intrusive_thought', regex: /(worst case|spiraling|thought loop|what if they hate me)/i },
    { cat: 'ideal_self', regex: /(ideal me|best version of myself)/i },
    { cat: 'fear_scenario', regex: /(i'm scared that|what if something bad)/i },
    { cat: 'simulation', regex: /(i run scenarios|i simulate conversations|playing out)/i },
    { cat: 'dream_state', regex: /(dreamed|in my dream|dream version)/i },
  ];

  extract(entries: MemoryEntry[]): ParacosmSignal[] {
    const out: ParacosmSignal[] = [];

    entries.forEach((e) => {
      const text = e.content || e.summary || '';
      this.patterns.forEach((p) => {
        if (p.regex.test(text)) {
          out.push({
            id: randomUUID(),
            text: text,
            timestamp: e.date,
            category: p.cat as ParacosmSignal['category'],
            confidence: 0.7,
          });
        }
      });
    });

    return out;
  }
}

