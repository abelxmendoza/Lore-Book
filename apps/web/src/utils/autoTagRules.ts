export type AutoTagRule = {
  pattern: RegExp;
  tag: string;
  rationale: string;
};

export const keywordMap: Record<string, string> = {
  robotics: 'robotics',
  startup: 'startup',
  training: 'training',
  breakup: 'breakup',
  la: 'los-angeles',
  losangeles: 'los-angeles',
  los_angeles: 'los-angeles',
  meditation: 'mindfulness',
  journal: 'reflection',
  competition: 'competition',
  fight: 'martial-arts',
  grappling: 'martial-arts',
  brazilian: 'martial-arts'
};

export const autoTagRules: AutoTagRule[] = [
  { pattern: /\b(ai|robot|drone|automation)\b/i, tag: 'robotics', rationale: 'Detected robotics themes' },
  { pattern: /\b(startup|venture|pitch|funding|mvp)\b/i, tag: 'startup', rationale: 'Startup building vibes' },
  { pattern: /\btrain(ing)?|spar|dojo|belt\b/i, tag: 'training', rationale: 'Training momentum detected' },
  { pattern: /\b(grief|heartbreak|breakup|loss)\b/i, tag: 'breakup', rationale: 'Emotional recovery thread' },
  { pattern: /\b(la|los angeles|hollywood|silverlake)\b/i, tag: 'la', rationale: 'Los Angeles context' },
  { pattern: /\b(memory|journal|log|diary)\b/i, tag: 'reflection', rationale: 'Reflective writing' },
  { pattern: /\b(robotics|lab|prototype|build)\b/i, tag: 'engineering', rationale: 'Hands-on building' },
  { pattern: /\b(team|crew|squad|partner)\b/i, tag: 'collaboration', rationale: 'People and teamwork' }
];

export const deriveTags = (text: string): string[] => {
  const normalized = text.toLowerCase();
  const matchesFromKeywords = Object.entries(keywordMap)
    .filter(([key]) => normalized.includes(key.replace(/[-_]/g, ' ')))
    .map(([, tag]) => tag);

  const matchesFromRules = autoTagRules
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.tag);

  return Array.from(new Set([...matchesFromKeywords, ...matchesFromRules]));
};
