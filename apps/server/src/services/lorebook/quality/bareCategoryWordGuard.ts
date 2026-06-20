/**
 * Reject bare category words unless meaningful context is present.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import type {
  EntityQualityCandidate,
  EntityQualityDomain,
  EntityQualityProvenance,
  EntityQualityVerdict,
} from './entityQualityGuardTypes';

const GLOBAL_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'so',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'from',
  'by',
  'as',
  'is',
  'was',
  'are',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'i',
  'me',
  'my',
  'we',
  'you',
  'they',
  'he',
  'she',
  'it',
  'this',
  'that',
  'these',
  'those',
  'someone',
  'somebody',
  'something',
  'anything',
  'everything',
  'nothing',
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'prof',
  'professor',
]);

const BARE_BY_DOMAIN: Record<EntityQualityDomain, Set<string>> = {
  characters: new Set(['person', 'guy', 'girl', 'man', 'woman', 'kid', 'child', 'someone']),
  locations: new Set([
    'house',
    'home',
    'store',
    'school',
    'gym',
    'club',
    'city',
    'street',
    'place',
    'room',
    'office',
    'park',
    'campus',
    'warehouse',
    'building',
  ]),
  groups: new Set(['friends', 'friend', 'family', 'team', 'class', 'club', 'people', 'group', 'crew', 'squad']),
  projects: new Set([
    'project',
    'app',
    'system',
    'feature',
    'phone',
    'website',
    'build',
    'repo',
    'product',
    'initiative',
    'tool',
    'platform',
  ]),
  events: new Set(['party', 'show', 'fight', 'meeting', 'interview', 'event', 'concert', 'prom', 'festival', 'gig']),
  skills: new Set([
    'fixing',
    'working',
    'learning',
    'doing',
    'coding',
    'training',
    'practice',
    'studying',
    'skill',
  ]),
  relationships: new Set(['friend', 'cousin', 'boss', 'recruiter', 'mentor', 'partner', 'coworker', 'colleague']),
  organizations: new Set(['company', 'school', 'bootcamp', 'workplace', 'employer', 'business', 'firm', 'agency']),
  timeline: new Set(['soon', 'later', 'before', 'after', 'then', 'when', 'time', 'date', 'day', 'week', 'month']),
  family: new Set(['family', 'household', 'relatives', 'parents', 'siblings']),
  schools: new Set(['school', 'class', 'campus', 'college', 'university', 'middle school', 'high school', 'elementary school']),
  work: new Set(['work', 'job', 'workplace', 'office', 'shift', 'role']),
  quests: new Set(['quest', 'task', 'goal', 'mission', 'todo', 'errand']),
};

const POSSESSIVE_RE = /\b[\w'.-]+(?:'s|’s)\s+/i;
const FROM_CONTEXT_RE =
  /\b(?:from|at|with|for|in|during|after|before)\s+(?:the\s+)?([A-Z][\w'&.-]+(?:\s+[A-Z][\w'&.-]+){0,4})/;
const NAMED_EVENT_RE =
  /\b(?:[A-Z][\w'.-]+(?:'s|’s)?\s+){1,3}(?:party|prom|show|interview|graduation|festival|concert|fight|meeting)\b/i;
const PROPER_MULTIWORD_RE = /^[A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)+$/;
const CALLED_NAMED_RE = /\b(?:called|named)\s+["']?([A-Z][\w'&.-]+(?:\s+[A-Z][\w'&.-]+){0,4})/i;

function hasMeaningfulContext(name: string, contextText: string, domain: EntityQualityDomain): boolean {
  const trimmed = name.trim();
  const ctx = contextText.trim();
  if (!trimmed || !ctx) return false;

  if (POSSESSIVE_RE.test(trimmed)) return true;
  if (PROPER_MULTIWORD_RE.test(trimmed)) return true;
  if (trimmed.includes("'") || trimmed.includes('’')) return true;

  if (domain === 'events' && NAMED_EVENT_RE.test(trimmed)) return true;
  if (/\b(?:graduation|prom|code red|ska)\b/i.test(trimmed) && trimmed.split(/\s+/).length >= 2) return true;

  if (FROM_CONTEXT_RE.test(ctx)) return true;
  if (/\bfrom\s+[A-Z]/i.test(ctx) && trimmed.split(/\s+/).length >= 2) return true;

  if (CALLED_NAMED_RE.test(ctx)) return true;
  if (/\b(?:ai memory app|memory app|navigation feature)\b/i.test(ctx)) return true;

  if (domain === 'projects' && /^[A-Z][\w'&.-]+(-\d+)?$/.test(trimmed)) return true;
  if (domain === 'skills' && /\b(?:ros2?|muay thai|japanese|aruco|typescript|python)\b/i.test(trimmed)) return true;

  return trimmed.split(/\s+/).filter(Boolean).length >= 3;
}

function contextualLabel(name: string, contextText: string, domain: EntityQualityDomain): string | null {
  const key = normalizeNameKey(name);
  const ctx = contextText.trim();

  const fromMatch = ctx.match(
    new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+from\\s+([^.!?\\n]{3,60})`, 'i')
  );
  if (fromMatch?.[1]) {
    const tail = fromMatch[1].trim().replace(/\s+(?:who|that|where|when).*$/i, '');
    if (tail.length >= 3) {
      const title = name.trim().replace(/^\w/, (c) => c.toUpperCase());
      return `${title} from ${tail.replace(/\b\w/g, (c, i) => (i === 0 ? c.toUpperCase() : c))}`;
    }
  }

  const genericFrom = ctx.match(FROM_CONTEXT_RE);
  if (genericFrom?.[1] && BARE_BY_DOMAIN[domain]?.has(key)) {
    const base = name.trim().replace(/^\w/, (c) => c.toUpperCase());
    return `${base} from ${genericFrom[1].trim()}`;
  }

  const possessive = ctx.match(/\b([\w'.-]+(?:'s|’s)\s+(?:house|home|compound|household))\b/i);
  if (possessive?.[1] && (key === 'house' || key === 'home')) {
    return possessive[1].replace(/\b\w/g, (c, i) => (i === 0 || ctx[i - 1] === ' ' ? c.toUpperCase() : c));
  }

  const called = ctx.match(CALLED_NAMED_RE);
  if (called?.[1] && (key === 'project' || key === 'app' || key === 'feature')) {
    return `${called[1].trim()} ${name.trim()}`.trim();
  }

  return null;
}

export function guardBareCategoryWord(
  candidate: EntityQualityCandidate
): EntityQualityVerdict | null {
  const name = candidate.name.trim();
  const key = normalizeNameKey(name);
  const contextText = [candidate.contextText, candidate.evidence].filter(Boolean).join(' ').trim();
  const provenance: EntityQualityProvenance[] = [];

  if (!key || key.length < 2) {
    return {
      gate: 'reject',
      name,
      domain: candidate.domain,
      rejectionReason: 'too_short',
      confidence: 0,
      provenance: [{ guard: 'bareCategoryWordGuard', rule: 'too_short' }],
      requiresReview: false,
    };
  }

  if (GLOBAL_STOPWORDS.has(key)) {
    provenance.push({ guard: 'bareCategoryWordGuard', rule: 'global_stopword', detail: key });
    return {
      gate: 'reject',
      name,
      domain: candidate.domain,
      rejectionReason: 'stopword_or_conjunction',
      confidence: 0,
      provenance,
      requiresReview: false,
    };
  }

  const bareSet = BARE_BY_DOMAIN[candidate.domain];
  if (!bareSet?.has(key)) return null;

  if (hasMeaningfulContext(name, contextText, candidate.domain)) {
    provenance.push({ guard: 'bareCategoryWordGuard', rule: 'bare_with_context', detail: key });
    return null;
  }

  const enriched = contextualLabel(name, contextText, candidate.domain);
  if (enriched && normalizeNameKey(enriched) !== key) {
    provenance.push({ guard: 'bareCategoryWordGuard', rule: 'contextualized_reference', detail: enriched });
    return {
      gate: 'contextualize',
      name,
      displayName: enriched,
      domain: candidate.domain,
      confidence: Math.max(candidate.confidence ?? 0.55, 0.62),
      provenance,
      requiresReview: false,
    };
  }

  provenance.push({ guard: 'bareCategoryWordGuard', rule: 'bare_category_word', detail: key });
  return {
    gate: 'reject',
    name,
    domain: candidate.domain,
    rejectionReason: `bare_category:${key}`,
    confidence: 0,
    provenance,
    requiresReview: false,
  };
}

export { GLOBAL_STOPWORDS, BARE_BY_DOMAIN, hasMeaningfulContext };
