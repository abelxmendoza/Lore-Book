import type { NarrativeMode, SelfTheme } from './types';

export class NarrativeModeExtractor {
  infer(themes: SelfTheme[]): NarrativeMode {
    // crude classifier based on dominant themes
    const map: Record<string, string[]> = {
      warrior: ['survival', 'violence', 'rebirth'],
      hero: ['purpose', 'connection', 'growth'],
      antihero: ['shadow', 'violence', 'identity'],
      rebel: ['revenge', 'transformation'],
      builder: ['ambition', 'purpose'],
      outsider: ['self_worth', 'identity', 'survival'],
      loner: ['identity', 'self_worth'],
      sage: ['purpose', 'growth', 'transformation'],
      protector: ['connection', 'purpose'],
    };

    const scoring: Record<string, number> = {};

    themes.forEach((t) => {
      Object.entries(map).forEach(([mode, keys]) => {
        if (keys.includes(t.theme)) {
          scoring[mode] = (scoring[mode] || 0) + t.strength;
        }
      });
    });

    const sorted = Object.entries(scoring).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];

    return {
      mode: (top?.[0] as NarrativeMode['mode']) || 'outsider',
      confidence: top ? Math.min(1, top[1]) : 0.4,
    };
  }
}

