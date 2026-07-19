/**
 * Narrative identity — what a scene is fundamentally about (domain + subject).
 * Shared by chapter assembly and narrative ownership (no circular imports).
 */

export type NarrativeDomain =
  | 'romance'
  | 'family'
  | 'friends'
  | 'career'
  | 'creative'
  | 'health'
  | 'education'
  | 'travel'
  | 'finances'
  | 'social_scene'
  | 'errands'
  | 'unknown';

export type NarrativeIdentity = {
  domain: NarrativeDomain;
  secondaryDomain: NarrativeDomain | null;
  subject: string | null;
  subjectLabel: string | null;
  statement: string;
};

export type ChapterSceneInput = {
  id: string;
  title: string;
  summary: string;
  timeStart: string | null;
  timeEnd: string | null;
  location?: string | null;
  participants?: string[];
  primaryGoal?: string | null;
  dominantEmotion?: string | null;
  significanceScore?: number;
  promotedEventId?: string | null;
  themes?: string[];
};

function compact(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function sceneBlob(scene: ChapterSceneInput): string {
  return `${scene.title} ${scene.summary} ${scene.primaryGoal ?? ''} ${(scene.themes ?? []).join(' ')}`.toLowerCase();
}

const SELF_TOKENS = new Set(['i', 'me', 'my', 'myself', 'self', 'user']);

export function castOf(scene: ChapterSceneInput): string[] {
  return (scene.participants ?? [])
    .map(normalizeToken)
    .filter((p) => p && !SELF_TOKENS.has(p));
}

const DOMAIN_PATTERNS: Array<{ domain: NarrativeDomain; pattern: RegExp; weight: number }> = [
  {
    domain: 'romance',
    pattern:
      /\b(?:girlfriend|boyfriend|partner|breakup|broke up|blocked me|blocked|unfollowed|ghost(?:ed|ing)?|no contact|dating|date night|first date|went on a date|dates?|situationship|crush|hooked up|kissed|slept with|romantic|my ex|her ex|his ex|anniversary)\b/,
    weight: 3,
  },
  {
    domain: 'family',
    pattern:
      /\b(?:mom|mother|dad|father|grandma|grandmother|grandpa|grandfather|abuela|abuelo|t[ií]a|t[ií]o|aunt|uncle|cousin|sister|brother|sibling|nephew|niece|family)\b/,
    weight: 2,
  },
  {
    domain: 'career',
    pattern:
      /\b(?:job|work shift|shift|boss|coworker|co-worker|interview|onboard(?:ing)?|hired|promotion|laid off|fired|career|office|workplace|clock(?:ed)? in)\b/,
    weight: 2,
  },
  {
    domain: 'creative',
    pattern:
      /\b(?:built|building|build|coded|coding|shipped|deployed|prototype|designed|composed|recorded|wrote|working on|worked on)\b/,
    weight: 2,
  },
  {
    domain: 'health',
    pattern:
      /\b(?:gym|workout|lifting|ran|running|doctor|dentist|therapy|therapist|sick|injury|injured|surgery|hospital|diet|meds)\b/,
    weight: 2,
  },
  {
    domain: 'education',
    pattern: /\b(?:class|school|college|university|exam|midterm|final(?:s)?|homework|course|degree|studying|studied)\b/,
    weight: 2,
  },
  {
    domain: 'travel',
    pattern: /\b(?:trip|flight|flew|traveled|travelling|vacation|road trip|airport|hotel|airbnb|abroad)\b/,
    weight: 2,
  },
  {
    domain: 'finances',
    pattern: /\b(?:rent|paycheck|budget|debt|loan|invested|investment|savings|paid off|taxes)\b/,
    weight: 2,
  },
  {
    domain: 'social_scene',
    pattern:
      /\b(?:club|show|concert|gig|set|bar|party|afters|afterparty|festival|rave|dj|prom|night out|danced|dancing)\b/,
    weight: 1,
  },
  {
    domain: 'friends',
    pattern: /\b(?:friend|friends|hung out|hangout|met up|caught up|visited)\b/,
    weight: 1,
  },
  {
    domain: 'errands',
    pattern: /\b(?:grocery|groceries|shopping|errand(?:s)?|store run|bought|picked up|returned)\b/,
    weight: 1,
  },
];

const GOAL_DOMAIN: Record<string, NarrativeDomain> = {
  career_progress: 'career',
  creative_work: 'creative',
  errand_visit: 'errands',
};

export const PERSON_DOMAINS = new Set<NarrativeDomain>(['romance', 'family', 'friends']);

function scoreDomains(scene: ChapterSceneInput): Map<NarrativeDomain, number> {
  const blob = sceneBlob(scene);
  const scores = new Map<NarrativeDomain, number>();
  for (const { domain, pattern, weight } of DOMAIN_PATTERNS) {
    const matches = blob.match(new RegExp(pattern.source, 'g'));
    if (matches?.length) scores.set(domain, (scores.get(domain) ?? 0) + weight * matches.length);
  }
  const goalDomain = scene.primaryGoal ? GOAL_DOMAIN[scene.primaryGoal] : undefined;
  if (goalDomain) scores.set(goalDomain, (scores.get(goalDomain) ?? 0) + 1);
  return scores;
}

function pickSubject(scene: ChapterSceneInput): { subject: string | null; subjectLabel: string | null } {
  const cast = castOf(scene);
  if (cast.length === 0) return { subject: null, subjectLabel: null };
  const blob = sceneBlob(scene);
  const mentioned = cast.find((p) => blob.includes(p));
  const subject = mentioned ?? cast[0];
  return { subject, subjectLabel: titleCase(subject) };
}

function identityStatement(
  domain: NarrativeDomain,
  subjectLabel: string | null,
  anchor: ChapterSceneInput,
): string {
  switch (domain) {
    case 'romance':
      return subjectLabel
        ? `This chapter is about your relationship with ${subjectLabel}.`
        : 'This chapter is about your romantic life.';
    case 'family':
      return subjectLabel
        ? `This chapter is about family time with ${subjectLabel}.`
        : 'This chapter is about family life.';
    case 'friends':
      return subjectLabel
        ? `This chapter is about your friendship with ${subjectLabel}.`
        : 'This chapter is about time with friends.';
    case 'career':
      return 'This chapter is about your work life.';
    case 'creative':
      return 'This chapter is about what you were building.';
    case 'health':
      return 'This chapter is about your health.';
    case 'education':
      return 'This chapter is about school and learning.';
    case 'travel':
      return 'This chapter is about a trip.';
    case 'finances':
      return 'This chapter is about money.';
    case 'social_scene':
      return 'This chapter is about nights out.';
    case 'errands':
      return 'This chapter is about everyday errands.';
    default:
      return anchor.title ? `This chapter is about "${compact(anchor.title)}".` : '';
  }
}

/** Classify one scene: what is this memory fundamentally about? */
export function classifySceneNarrative(scene: ChapterSceneInput): NarrativeIdentity {
  const scores = scoreDomains(scene);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const domain = ranked[0]?.[0] ?? 'unknown';
  const secondaryDomain = ranked[1]?.[0] ?? null;

  let effectiveDomain = domain;
  const { subject, subjectLabel } = pickSubject(scene);
  if (domain === 'unknown' && subject) effectiveDomain = 'friends';

  const personSubject = PERSON_DOMAINS.has(effectiveDomain) ? subject : null;
  const personLabel = PERSON_DOMAINS.has(effectiveDomain) ? subjectLabel : null;

  return {
    domain: effectiveDomain,
    secondaryDomain: secondaryDomain === effectiveDomain ? null : secondaryDomain,
    subject: personSubject,
    subjectLabel: personLabel,
    statement: identityStatement(effectiveDomain, personLabel, scene),
  };
}
