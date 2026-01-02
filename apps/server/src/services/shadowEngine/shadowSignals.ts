import type { ShadowSignal } from './shadowTypes';

export const extractShadowSignals = (entryText: string): ShadowSignal[] => {
  const patterns = [
    { type: 'anger_suppressed' as const, keywords: ['i held it in', 'i wanted to snap', 'bit my tongue'] },
    { type: 'envy' as const, keywords: ['i wish i had', 'better than me', 'ahead of me'] },
    { type: 'jealousy' as const, keywords: ['they replaced me', 'i felt jealous', 'took my spot'] },
    { type: 'ego_defense' as const, keywords: ["i'm not wrong", "they don't get me", 'they should respect me'] },
    { type: 'avoidance' as const, keywords: ['i avoided', 'i ghosted', 'i dipped', 'i ran'] },
    { type: 'shame' as const, keywords: ['embarrassed', 'i hate that i did', 'felt pathetic'] },
    { type: 'guilt' as const, keywords: ['i regret', "shouldn't have", 'i messed up'] },
    { type: 'resentment' as const, keywords: ["i can't forgive", 'still mad', 'i hold it against'] },
    { type: 'self_sabotage' as const, keywords: ['i ruined it', 'i sabotaged', 'i pushed them away'] },
    { type: 'power_projection' as const, keywords: ['i had to dominate', 'prove myself', 'show them'] },
    { type: 'identity_mask' as const, keywords: ['i pretended', 'i acted like', 'not really me'] },
  ];

  const lowerText = entryText.toLowerCase();
  const signals: ShadowSignal[] = [];

  patterns.forEach((p) => {
    p.keywords.forEach((k) => {
      if (lowerText.includes(k)) {
        signals.push({
          type: p.type,
          text: k,
          intensity: 0.7 + Math.random() * 0.3,
        });
      }
    });
  });

  return signals;
};

