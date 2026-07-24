/**
 * Route a capability label to ontology type: skill vs activity vs project vs ...
 */

import type { CapabilityEntityType } from './skillCognitionTypes';
import { normalizeSkillKey } from './skillIdentity';

type RouteRule = {
  entityType: CapabilityEntityType;
  patterns: RegExp[];
  exact?: string[];
};

const RULES: RouteRule[] = [
  {
    entityType: 'PROJECT',
    exact: ['lorebook', 'lore book', 'lore-book'],
    patterns: [/^lorebook$/i],
  },
  {
    entityType: 'PROJECT_APPLICATION',
    patterns: [
      /lorebook\s+(?:app\s+)?development/i,
      /building\s+lorebook/i,
      /lorebook\s+engineering/i,
    ],
  },
  {
    entityType: 'FIELD_OF_STUDY',
    patterns: [
      /electrical\s+engineering/i,
      /computer\s+science/i,
      /mechanical\s+engineering/i,
      /\bmaster'?s\s+in\b/i,
      /\bdegree\s+in\b/i,
    ],
  },
  {
    entityType: 'KNOWLEDGE_AREA',
    exact: ['artificial intelligence', 'ai', 'machine learning', 'ml'],
    patterns: [/^artificial\s+intelligence$/i, /^machine\s+learning$/i],
  },
  {
    entityType: 'ACTIVITY',
    exact: ['clubbing', 'going out', 'nightlife'],
    patterns: [/^clubbing$/i, /socializing\s+at\s+/i, /socializing\s+in\s+/i],
  },
  {
    entityType: 'HOBBY',
    patterns: [/\bk-?pop\s+danc/i, /\bcosplay\b(?!\s+planning)/i],
  },
  {
    entityType: 'INTEREST',
    patterns: [
      /one\s+piece/i,
      /character\s+analysis/i,
      /anime\s+analysis/i,
      /fandom/i,
      /^event\s+observation$/i,
    ],
  },
  {
    entityType: 'SOCIAL_CONTEXT',
    patterns: [
      /goth\s*(?:\/|and|&)?\s*underground/i,
      /goth\s+clubs?/i,
      /underground\s+scenes?/i,
      /nightlife\s+scenes?/i,
    ],
  },
  {
    entityType: 'RESPONSIBILITY',
    patterns: [
      /family\s+care/i,
      /care\s+coordination/i,
      /errand\s+running/i,
      /driving\s+and\s+errand/i,
      /family\s+logistics/i,
      /family\s+support/i,
    ],
  },
  {
    entityType: 'PROCESS',
    exact: ['job search', 'job hunting', 'job-search'],
    patterns: [/^job\s+search(?:\s*\/\s*interviewing)?$/i, /application\s+management/i],
  },
  {
    entityType: 'ROLE',
    patterns: [/faction.*management/i, /organization\s+management/i, /\bleadership\b/i],
  },
  {
    entityType: 'OBSERVATION',
    patterns: [/^event\s+observation$/i, /notic(?:e|ing)\s+(?:the\s+)?(?:line|crowd)/i],
  },
];

/** Known durable skills that must route as SKILL even if they touch borderline words. */
const FORCE_SKILL = [
  'front-end development',
  'frontend development',
  'front end development',
  'ai-assisted coding',
  'ai coding tools',
  'software debugging',
  'debugging',
  'failure analysis',
  'interviewing',
  'networking',
  'ui/ux design',
  'product testing',
  'product iteration',
  'marketing myself',
  'personal branding',
  'professional self-marketing',
  'coding',
  'running',
  'prototyping',
  'laboratory operations',
  'muay thai',
  'brazilian jiu-jitsu',
  'scheduling',
];

export function routeCapabilityOntology(
  span: string,
  evidenceText = '',
): { entityType: CapabilityEntityType; reasons: string[] } {
  const key = normalizeSkillKey(span);
  const reasons: string[] = [];
  const combined = `${span} ${evidenceText}`;

  if (FORCE_SKILL.some((s) => normalizeSkillKey(s) === key)) {
    // Muay Thai bare mention may still be ACTIVITY — decided by eligibility, not router.
    if (key === normalizeSkillKey('muay thai') && !/\b(?:train|practice|spar|fight|class|gym|session)\b/i.test(combined)) {
      reasons.push('muay_thai_bare_mention_activity');
      return { entityType: 'ACTIVITY', reasons };
    }
    reasons.push('force_skill_allowlist');
    return { entityType: 'SKILL', reasons };
  }

  for (const rule of RULES) {
    if (rule.exact?.some((e) => normalizeSkillKey(e) === key)) {
      reasons.push(`exact:${rule.entityType}`);
      return { entityType: rule.entityType, reasons };
    }
    if (rule.patterns.some((p) => p.test(span) || p.test(combined))) {
      reasons.push(`pattern:${rule.entityType}`);
      return { entityType: rule.entityType, reasons };
    }
  }

  // "I like X" without practice → interest
  if (/\bi\s+(?:like|love|enjoy|am\s+into)\b/i.test(evidenceText) && !/\b(?:train|practice|work|build|code)\b/i.test(evidenceText)) {
    reasons.push('preference_without_practice');
    return { entityType: 'INTEREST', reasons };
  }

  reasons.push('default_skill_candidate');
  return { entityType: 'SKILL', reasons };
}

export function entityTypeIsSkillBookEligible(entityType: CapabilityEntityType): boolean {
  return entityType === 'SKILL' || entityType === 'PROJECT_APPLICATION';
}
