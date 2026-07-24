/**
 * Canonical skill titles + alias map for consolidation.
 */

import { normalizeSkillKey } from './skillIdentity';

export type SkillCanonicalResolution = {
  canonicalTitle: string;
  aliases: string[];
  rulesFired: string[];
};

/** Alias group → canonical title */
const CANONICAL_GROUPS: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: 'AI-Assisted Coding',
    aliases: [
      'ai coding tools',
      'ai-assisted coding',
      'ai assisted coding',
      'ai coding',
      'coding with ai',
      'ai pair programming',
    ],
  },
  {
    canonical: 'Front-End Development',
    aliases: [
      'frontend development',
      'front-end development',
      'front end development',
      'frontend',
      'front-end',
    ],
  },
  {
    canonical: 'Software Debugging',
    aliases: ['debugging', 'software debugging', 'debug', 'bug fixing'],
  },
  {
    canonical: 'Professional Self-Marketing',
    aliases: ['marketing myself', 'personal branding', 'self marketing', 'professional self-marketing'],
  },
  {
    canonical: 'Interviewing',
    aliases: ['interviewing', 'job interviews', 'interview skills'],
  },
  {
    canonical: 'Networking',
    aliases: ['networking', 'professional networking', 'social networking'],
  },
  {
    canonical: 'Family Support',
    aliases: [
      'family care coordination',
      'family caregiving',
      'family caregiving / errand running',
      'driving and errand coordination',
      'family logistics',
      'family support',
    ],
  },
  {
    canonical: 'Software Product Development',
    aliases: [
      'product development',
      'software product development',
      'product iteration',
      'coding',
      'software development',
    ],
  },
  {
    canonical: 'UI/UX Design',
    aliases: ['ui/ux design', 'ui design', 'ux design', 'uiux'],
  },
  {
    canonical: 'Product Testing',
    aliases: ['product testing', 'qa testing', 'quality assurance'],
  },
  {
    canonical: 'Failure Analysis',
    aliases: ['failure analysis', 'root cause analysis', 'fault analysis'],
  },
  {
    canonical: 'Career Navigation',
    aliases: ['career navigation', 'job search / interviewing', 'job search'],
  },
  {
    canonical: 'Social Interaction',
    aliases: [
      'socializing',
      'social interaction',
      'socializing at goth clubs',
      'socializing in goth/underground scenes',
      'socializing in goth underground scenes',
    ],
  },
  {
    canonical: 'Muay Thai',
    aliases: ['muay thai', 'muaythai', 'thai boxing'],
  },
  {
    canonical: 'Artificial Intelligence',
    aliases: ['artificial intelligence', 'ai', 'machine learning', 'ml'],
  },
  {
    canonical: 'Electrical Engineering',
    aliases: ['electrical engineering', 'ee', 'electrical eng'],
  },
];

const PROJECT_LABELS = new Set([
  normalizeSkillKey('lorebook'),
  normalizeSkillKey('lore book'),
  normalizeSkillKey('lore-book'),
]);

export function resolveSkillCanonical(span: string): SkillCanonicalResolution {
  const key = normalizeSkillKey(span);
  const rulesFired: string[] = [];

  if (PROJECT_LABELS.has(key)) {
    rulesFired.push('project_label_lorebook');
    return { canonicalTitle: 'LoreBook', aliases: ['Lorebook', 'Lore Book'], rulesFired };
  }

  for (const group of CANONICAL_GROUPS) {
    const aliasKeys = [group.canonical, ...group.aliases].map(normalizeSkillKey);
    if (aliasKeys.includes(key)) {
      rulesFired.push(`canonical_group:${group.canonical}`);
      const aliases = Array.from(
        new Set(
          [group.canonical, ...group.aliases]
            .filter((a) => normalizeSkillKey(a) !== normalizeSkillKey(group.canonical))
            .map((a) => a.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/Ai-/g, 'AI-').replace(/Ui\/Ux/g, 'UI/UX')),
        ),
      );
      // Prefer well-cased canonicals from the table
      return {
        canonicalTitle: group.canonical,
        aliases: group.aliases.filter((a) => normalizeSkillKey(a) !== normalizeSkillKey(group.canonical)),
        rulesFired,
      };
    }
  }

  // Title-case fallback
  const titled = span
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bUi\/Ux\b/gi, 'UI/UX');
  rulesFired.push('title_case_fallback');
  return { canonicalTitle: titled || span.trim(), aliases: [], rulesFired };
}

export function isLoreBookProjectLabel(span: string): boolean {
  return PROJECT_LABELS.has(normalizeSkillKey(span));
}
