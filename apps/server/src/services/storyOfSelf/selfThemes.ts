import { randomUUID } from 'crypto';

import type { MemoryEntry } from '../../types';

import type { SelfTheme } from './types';

export class SelfThemeExtractor {
  extract(entries: MemoryEntry[]): SelfTheme[] {
    const themeMap: Record<string, string[]> = {};

    const patterns = [
      { key: 'survival', regex: /(survive|made it through|pushed through|hard times)/i },
      { key: 'rebirth', regex: /(reborn|restart|new era|fresh start|rise again)/i },
      { key: 'revenge', regex: /(prove them wrong|get back|vengeance)/i },
      { key: 'transformation', regex: /(changed|evolved|transformed|leveled up)/i },
      { key: 'ambition', regex: /(dream|goal|future|aspire|drive)/i },
      { key: 'identity', regex: /(who i am|finding myself|identity)/i },
      { key: 'connection', regex: /(friends|love|relationships|bond)/i },
      { key: 'violence', regex: /(fight|hit|punched|attacked|spar|hurt)/i },
      { key: 'self_worth', regex: /(i matter|i'm worth|i deserve)/i },
      { key: 'shadow', regex: /(my dark side|sabotage|self destruction)/i },
      { key: 'purpose', regex: /(purpose|mission|why i exist)/i },
    ];

    entries.forEach((e) => {
      const text = e.content || e.summary || '';
      patterns.forEach((p) => {
        if (p.regex.test(text)) {
          const key = p.key;
          themeMap[key] = themeMap[key] || [];
          themeMap[key].push(text);
        }
      });
    });

    return Object.entries(themeMap).map(([theme, evidence]) => ({
      id: randomUUID(),
      theme: theme as SelfTheme['theme'],
      evidence,
      strength: Math.min(1, evidence.length / 10),
    }));
  }
}

