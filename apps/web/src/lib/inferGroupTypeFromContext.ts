import type { GroupType } from '../components/organizations/OrganizationProfileCard';
import { GROUP_TYPE_LABELS } from './groupTypes';

export type InferGroupTypeInput = {
  groupName: string;
  details?: string;
  /** Character role in the story (occupation / relationship role). */
  characterRole?: string | null;
  characterArchetype?: string | null;
  memberRole?: string | null;
};

export type InferGroupTypeResult = {
  groupType: GroupType;
  label: string;
  confidence: number;
  reasons: string[];
};

type Rule = {
  type: GroupType;
  weight: number;
  patterns: RegExp[];
  reason: string;
};

const RULES: Rule[] = [
  {
    type: 'company',
    weight: 3,
    patterns: [
      /\b(inc|llc|ltd|corp|corporation|company|co\.|startup|employer|workplace|office|job)\b/i,
      /\b(works? at|coworker|colleague|hired|interview)\b/i,
    ],
    reason: 'company/workplace language',
  },
  {
    type: 'family',
    weight: 3,
    patterns: [/\b(family|relatives?|siblings?|parents?|cousins?|in-?laws?)\b/i],
    reason: 'family language',
  },
  {
    type: 'household',
    weight: 3,
    patterns: [/\b(household|roommates?|housemates?|flatmates?|lives with|shared apartment)\b/i],
    reason: 'household/roommate language',
  },
  {
    type: 'band',
    weight: 3,
    patterns: [/\b(band|musicians?|gig|tour|album|rehearsal|bassist|drummer|vocalist)\b/i],
    reason: 'band/music language',
  },
  {
    type: 'sports_team',
    weight: 3,
    patterns: [/\b(team|league|soccer|football|basketball|baseball|hockey|athlete|coach)\b/i],
    reason: 'sports team language',
  },
  {
    type: 'martial_arts',
    weight: 3,
    patterns: [/\b(dojo|martial arts|jiujitsu|jiu-jitsu|bjj|karate|taekwondo|muay thai|kickboxing)\b/i],
    reason: 'martial arts language',
  },
  {
    type: 'club',
    weight: 2,
    patterns: [/\b(club|society|chapter|membership)\b/i],
    reason: 'club language',
  },
  {
    type: 'nonprofit',
    weight: 2,
    patterns: [/\b(nonprofit|non-profit|charity|foundation|volunteer)\b/i],
    reason: 'nonprofit language',
  },
  {
    type: 'institution',
    weight: 2,
    patterns: [/\b(university|college|school|hospital|government|agency|department)\b/i],
    reason: 'institution language',
  },
  {
    type: 'crew',
    weight: 2,
    patterns: [/\b(crew|squad|posse|inner circle)\b/i],
    reason: 'crew language',
  },
  {
    type: 'friend_group',
    weight: 2,
    patterns: [/\b(friends?|friend group|hangout|social circle)\b/i],
    reason: 'friend-group language',
  },
  {
    type: 'scene',
    weight: 2,
    patterns: [/\b(scene|underground|nightlife|community scene)\b/i],
    reason: 'scene language',
  },
  {
    type: 'community',
    weight: 2,
    patterns: [/\b(community|neighborhood|local group|congregation)\b/i],
    reason: 'community language',
  },
  {
    type: 'collective',
    weight: 2,
    patterns: [/\b(collective|coop|co-op|artist group)\b/i],
    reason: 'collective language',
  },
  {
    type: 'brand',
    weight: 2,
    patterns: [/\b(brand|label|product line)\b/i],
    reason: 'brand language',
  },
  {
    type: 'vendor',
    weight: 2,
    patterns: [/\b(vendor|supplier|contractor|agency client)\b/i],
    reason: 'vendor language',
  },
  {
    type: 'project',
    weight: 2,
    patterns: [/\b(project|build|side hustle|initiative)\b/i],
    reason: 'project language',
  },
  {
    type: 'event_group',
    weight: 2,
    patterns: [/\b(event|meetup|conference|festival|organizing committee)\b/i],
    reason: 'event-group language',
  },
  {
    type: 'team',
    weight: 1.5,
    patterns: [/\b(work team|product team|engineering team|ops team)\b/i],
    reason: 'work-team language',
  },
  {
    type: 'public_entity',
    weight: 1.5,
    patterns: [/\b(public|city of|county|municipal)\b/i],
    reason: 'public-entity language',
  },
];

/**
 * Lightweight client-side guess for group vs organization classification.
 * Used to seed chat compose + entity setup; server extraction remains authoritative.
 */
export function inferGroupTypeFromContext(input: InferGroupTypeInput): InferGroupTypeResult {
  const corpus = [
    input.groupName,
    input.details,
    input.characterRole,
    input.characterArchetype,
    input.memberRole,
  ]
    .filter(Boolean)
    .join(' \n ')
    .trim();

  if (!corpus) {
    return {
      groupType: 'other',
      label: GROUP_TYPE_LABELS.other,
      confidence: 0.2,
      reasons: ['insufficient context'],
    };
  }

  const scores = new Map<GroupType, { score: number; reasons: string[] }>();
  for (const rule of RULES) {
    let hits = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(corpus)) hits += 1;
    }
    if (hits === 0) continue;
    const prev = scores.get(rule.type) ?? { score: 0, reasons: [] };
    prev.score += rule.weight * hits;
    prev.reasons.push(rule.reason);
    scores.set(rule.type, prev);
  }

  // Soft priors from character occupation when name/details are thin.
  const role = `${input.characterRole ?? ''} ${input.characterArchetype ?? ''}`.toLowerCase();
  if (/\b(coworker|colleague|manager|engineer|founder)\b/.test(role)) {
    const prev = scores.get('company') ?? { score: 0, reasons: [] };
    prev.score += 1;
    prev.reasons.push('character role suggests workplace');
    scores.set('company', prev);
  }
  if (/\b(sibling|parent|cousin|relative|family)\b/.test(role)) {
    const prev = scores.get('family') ?? { score: 0, reasons: [] };
    prev.score += 1;
    prev.reasons.push('character role suggests family');
    scores.set('family', prev);
  }

  let best: GroupType = 'other';
  let bestScore = 0;
  let reasons: string[] = ['no strong classification signals'];
  for (const [type, entry] of scores) {
    if (entry.score > bestScore) {
      best = type;
      bestScore = entry.score;
      reasons = entry.reasons;
    }
  }

  const confidence =
    bestScore <= 0 ? 0.25 : Math.min(0.92, 0.35 + bestScore * 0.12);

  return {
    groupType: best,
    label: GROUP_TYPE_LABELS[best],
    confidence,
    reasons: Array.from(new Set(reasons)).slice(0, 3),
  };
}
