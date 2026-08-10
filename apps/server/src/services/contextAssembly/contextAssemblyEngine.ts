/**
 * Blueprint 14 — virtual, request-scoped context assembly.
 *
 * This module does not retrieve or persist memory. It decides which part of a
 * user's life a question is about, then gates candidate evidence before the
 * working-memory ranker spends its budget.
 */

export type ContextKind =
  | 'identity'
  | 'career'
  | 'education'
  | 'projects'
  | 'relationships'
  | 'family'
  | 'music'
  | 'fitness'
  | 'community'
  | 'travel'
  | 'places'
  | 'events'
  | 'temporal'
  | 'goals'
  | 'skills'
  | 'debug'
  | 'general';

export type RankedContext = {
  context: ContextKind;
  score: number;
  reasons: string[];
};

export type ContextAssemblyPlan = {
  version: 'context-assembly-v1';
  primary: ContextKind;
  secondary: ContextKind[];
  excluded: ContextKind[];
  ranked: RankedContext[];
  reason: string;
  strictBoundary: boolean;
};

export type ContextCandidate = {
  type?: string;
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  reasons?: string[];
};

export type ContextCandidateVerdict = {
  accepted: boolean;
  memberships: ContextKind[];
  matchedContexts: ContextKind[];
  driftScore: number;
  reason: string;
};

type IntentLike = string | undefined;

const CONTEXT_CUES: Record<ContextKind, RegExp> = {
  identity: /\b(identity|who am i|defines? me|about me|my life|my story|kind of person)\b/i,
  career: /\b(career|work(?:ed|ing)?|jobs?|employment|employer|coworker|manager|interview|hired|laid off|promotion|salary|shift|engineer(?:ing)?|professional|resume|recruiter|startup|founder|business)\b/i,
  education: /\b(school|college|university|degree|graduat(?:e|ed|ion)|student|class|course|education|certificate|certification)\b/i,
  projects: /\b(project|startup|repo|codebase|feature|shipping|prototype|build(?:ing|t)?|architecture|deployment|release)\b/i,
  relationships: /\b(relationship|dating|romance|romantic|crush|partner|girlfriend|boyfriend|ex\b|love life|breakup|friendship)\b/i,
  family: /\b(family|mother|father|mom|dad|grandma|grandpa|abuel[oa]|aunt|uncle|t[ií][oa]|cousin|sibling|brother|sister|household)\b/i,
  music: /\b(music|song|album|single|track|recording|band|artist|stage name|spotify|bandlab|suno|concert|gig|perform(?:ed|ance)?)\b/i,
  fitness: /\b(fitness|workout|gym|training|exercise|martial arts|climbing|running|strength)\b/i,
  community: /\b(community|communities|scene|club|crew|circle|group|organization|meetup)\b/i,
  travel: /\b(travel|trip|vacation|flight|hotel|visited|journey|tour)\b/i,
  places: /\b(place|location|venue|city|neighborhood|address|where did|where was)\b/i,
  events: /\b(event|happened|moment|show|festival|party|wedding|funeral|birthday|graduation)\b/i,
  temporal: /\b(timeline|history|over time|today|yesterday|this week|this month|summer|year|when|chronological)\b/i,
  goals: /\b(goal|quest|working toward|aiming|plan(?:ning)? to|want to|milestone|blocker|priority)\b/i,
  skills: /\b(skill|ability|good at|learning|practicing|proficiency|competence|experience with)\b/i,
  debug: /\b(debug|diagnostic|why did you retrieve|context assembly|memory status|did you save)\b/i,
  general: /$^/,
};

const INTENT_PRIMARY: Record<string, ContextKind> = {
  PERSON_QUERY: 'relationships',
  RELATIONSHIP_QUERY: 'relationships',
  PLACE_QUERY: 'places',
  PROJECT_QUERY: 'projects',
  CAREER_QUERY: 'career',
  GOAL_QUERY: 'goals',
  SKILL_QUERY: 'skills',
  COMMUNITY_QUERY: 'community',
  EVENT_QUERY: 'events',
  IDENTITY_QUERY: 'identity',
  LIFE_REVIEW: 'identity',
  ARC_QUERY: 'identity',
  CHAPTER_QUERY: 'identity',
  DIRECTION_QUERY: 'goals',
  MOMENTUM_QUERY: 'goals',
  CONFLICT_QUERY: 'identity',
  DEBUG_QUERY: 'debug',
  TODAY_QUERY: 'temporal',
  YESTERDAY_QUERY: 'temporal',
  THIS_WEEK_QUERY: 'temporal',
  THIS_MONTH_QUERY: 'temporal',
  TIME_RANGE_QUERY: 'temporal',
  TEMPORAL_COMPARISON_QUERY: 'temporal',
  TIMELINE_QUERY: 'temporal',
  work: 'career',
  family: 'family',
  relationship: 'relationships',
  project: 'projects',
  place: 'places',
  event: 'events',
  biography: 'identity',
  timeline: 'temporal',
  general: 'general',
};

const SECONDARY: Record<ContextKind, ContextKind[]> = {
  career: ['education', 'projects', 'skills', 'goals'],
  education: ['career', 'skills', 'projects'],
  projects: ['career', 'skills', 'goals', 'events'],
  relationships: ['events', 'places', 'community'],
  family: ['relationships', 'events', 'places'],
  music: ['projects', 'skills', 'identity', 'events'],
  fitness: ['skills', 'goals', 'identity', 'places'],
  community: ['relationships', 'events', 'places'],
  travel: ['places', 'events', 'relationships'],
  places: ['events', 'relationships', 'travel'],
  events: ['temporal', 'places', 'relationships'],
  temporal: ['events'],
  goals: ['projects', 'career', 'skills', 'identity'],
  skills: ['career', 'projects', 'identity'],
  identity: ['career', 'projects', 'music', 'skills', 'goals', 'relationships'],
  debug: [],
  general: ['identity', 'events'],
};

const EXCLUDED: Partial<Record<ContextKind, ContextKind[]>> = {
  career: ['relationships', 'family', 'music', 'community', 'travel'],
  projects: ['relationships', 'family', 'travel'],
  relationships: ['career', 'education', 'projects', 'skills'],
  family: ['career', 'projects', 'music'],
  music: ['relationships', 'family', 'career'],
  temporal: [],
  debug: [],
};

function cueContexts(text: string): ContextKind[] {
  return (Object.entries(CONTEXT_CUES) as Array<[ContextKind, RegExp]>)
    .filter(([context, cue]) => context !== 'general' && cue.test(text))
    .map(([context]) => context);
}

function inferredPrimary(question: string, intent?: IntentLike): ContextKind {
  const fromIntent = intent ? INTENT_PRIMARY[intent] : undefined;
  const cues = cueContexts(question);

  // A named life domain beats the generic timeline/temporal wrapper. This is
  // what makes "career timeline" a career assembly rather than all events.
  const domainPriority: ContextKind[] = [
    'career', 'relationships', 'family', 'projects', 'music', 'fitness',
    'education', 'community', 'travel', 'places', 'goals', 'skills', 'identity',
  ];
  const explicitDomain = domainPriority.find((context) => cues.includes(context));
  if (explicitDomain) return explicitDomain;
  return fromIntent ?? (cues[0] || 'general');
}

export function buildContextAssemblyPlan(input: {
  question: string;
  intent?: IntentLike;
}): ContextAssemblyPlan {
  const primary = inferredPrimary(input.question, input.intent);
  const promptCues = cueContexts(input.question).filter((context) => context !== primary);
  const secondary = [...new Set([...(SECONDARY[primary] ?? []), ...promptCues])]
    .filter((context) => !(EXCLUDED[primary] ?? []).includes(context));
  const excluded = (EXCLUDED[primary] ?? []).filter((context) => !promptCues.includes(context));
  const ranked: RankedContext[] = [
    { context: primary, score: 1, reasons: ['primary intent context'] },
    ...secondary.map((context, index) => ({
      context,
      score: Number(Math.max(0.35, 0.72 - index * 0.06).toFixed(2)),
      reasons: [promptCues.includes(context) ? 'explicit prompt cue' : `linked to ${primary}`],
    })),
  ];

  return {
    version: 'context-assembly-v1',
    primary,
    secondary,
    excluded,
    ranked,
    reason: `Question resolved to ${primary} context${input.intent ? ` from ${input.intent}` : ''}.`,
    strictBoundary: !['identity', 'temporal', 'general', 'debug'].includes(primary),
  };
}

export function classifyCandidateContexts(candidate: ContextCandidate): ContextKind[] {
  const metadataContexts = Array.isArray(candidate.metadata?.contexts)
    ? candidate.metadata!.contexts.filter((value): value is ContextKind =>
        typeof value === 'string' && value in CONTEXT_CUES)
    : [];
  const text = `${candidate.title ?? ''} ${candidate.content ?? ''} ${candidate.source ?? ''}`;
  const cues = cueContexts(text);
  const structured: ContextKind[] = [];

  switch (candidate.type) {
    case 'project': structured.push('projects'); break;
    case 'relationship': structured.push('relationships'); break;
    case 'skill': structured.push('skills'); break;
    case 'goal': structured.push('goals'); break;
    case 'community': structured.push('community'); break;
    case 'event': structured.push('events'); break;
    case 'timeline': structured.push('events', 'temporal'); break;
    case 'preference': structured.push('identity'); break;
    case 'debug': structured.push('debug'); break;
  }

  if (candidate.metadata?.is_professional === true) structured.push('career');
  return [...new Set([...metadataContexts, ...structured, ...cues])];
}

export function evaluateContextCandidate(
  candidate: ContextCandidate,
  plan: ContextAssemblyPlan,
  options: { target?: string | null } = {},
): ContextCandidateVerdict {
  const memberships = classifyCandidateContexts(candidate);
  const allowed = new Set([plan.primary, ...plan.secondary]);
  const matchedContexts = memberships.filter((context) => allowed.has(context));
  const excludedMatches = memberships.filter((context) => plan.excluded.includes(context));

  // Evidence carrying a primary-context cue is an explicit cross-context link:
  // a song release can enter a career answer only when the record itself says
  // it was professional work, not merely because music exists elsewhere.
  const targetKey = options.target?.toLowerCase().trim();
  const candidateText = `${candidate.title ?? ''} ${candidate.content ?? ''}`.toLowerCase();
  const resolverLinked = candidate.reasons?.some((reason) =>
    /matches target|scoped canonical|resolved query anchor/i.test(reason),
  );
  const targetLinked = Boolean(resolverLinked || (targetKey && candidateText.includes(targetKey)));
  const primaryLinked = memberships.includes(plan.primary) || targetLinked;
  const careerNeedsExplicitLink =
    plan.primary === 'career' &&
    !primaryLinked &&
    memberships.some((context) => ['projects', 'skills', 'goals'].includes(context));
  const accepted =
    plan.primary === 'general' ||
    plan.primary === 'debug' ||
    primaryLinked ||
    (matchedContexts.length > 0 &&
      !careerNeedsExplicitLink &&
      (!plan.strictBoundary || excludedMatches.length === 0));
  const driftScore = accepted
    ? 0
    : Number((excludedMatches.length > 0 ? 1 : memberships.length === 0 ? 0.7 : 0.85).toFixed(2));

  return {
    accepted,
    memberships,
    matchedContexts,
    driftScore,
    reason: accepted
      ? `context_match:${targetLinked ? 'resolved_target' : matchedContexts.join(',') || plan.primary}`
      : excludedMatches.length > 0
        ? `context_drift:${excludedMatches.join(',')}`
        : `outside_context:${plan.primary}`,
  };
}
