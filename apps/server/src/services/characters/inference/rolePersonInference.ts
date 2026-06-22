/** Bare generic labels that cannot become characters without contextual conversion. */
export const BARE_GENERIC_LABELS = new Set([
  'guy',
  'girl',
  'man',
  'woman',
  'person',
  'someone',
  'somebody',
  'friend',
  'best friend',
  'cousin',
  'professor',
  'recruiter',
  'investor',
  'promoter',
  'coworker',
  'manager',
  'boss',
  'neighbor',
  'homie',
  'new guy',
  'the new guy',
  'old roommate',
  'old college roommate',
  'roommate',
  'tio',
  'tia',
  'tía',
  'tío',
  'mr',
  'dr',
  'coach',
]);

export const EMOTIONAL_WEIGHT_PHRASES: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /\bbest friend\b/i, weight: 0.15, label: 'best friend' },
  { pattern: /\bcrush\b/i, weight: 0.12, label: 'crush' },
  { pattern: /\bmy ex\b/i, weight: 0.12, label: 'ex' },
  { pattern: /\bghosted\b/i, weight: 0.1, label: 'ghosted' },
  { pattern: /\bblocked\b/i, weight: 0.1, label: 'blocked' },
  { pattern: /\bfight\b/i, weight: 0.08, label: 'fight' },
  { pattern: /\bhelped me\b/i, weight: 0.1, label: 'helped me' },
  { pattern: /\bbetrayed me\b/i, weight: 0.12, label: 'betrayed me' },
  { pattern: /\bmentor\b/i, weight: 0.1, label: 'mentor' },
  { pattern: /\binvestor\b/i, weight: 0.08, label: 'investor' },
  { pattern: /\brecruiter\b/i, weight: 0.08, label: 'recruiter' },
  { pattern: /\bfamily\b/i, weight: 0.1, label: 'family' },
  { pattern: /\bloved\b/i, weight: 0.1, label: 'loved' },
  { pattern: /\bscared\b/i, weight: 0.08, label: 'scared' },
  { pattern: /\bembarrassed\b/i, weight: 0.08, label: 'embarrassed' },
];

export function detectEmotionalWeight(text: string): { boost: number; label?: string } {
  let boost = 0;
  let label: string | undefined;
  for (const item of EMOTIONAL_WEIGHT_PHRASES) {
    if (item.pattern.test(text)) {
      boost += item.weight;
      label = item.label;
    }
  }
  return { boost: Math.min(boost, 0.35), label };
}

export function isBareGenericLabel(name: string): boolean {
  const key = (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return BARE_GENERIC_LABELS.has(key);
}
