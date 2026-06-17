/**
 * Multi-domain vicarious relationship intelligence — people connected to a subject
 * the user knows ("Sam's roommate", "Jordan's manager", "Taylor's mom").
 */
import { normalizeNameKey } from '../../utils/nameNormalization';
import { isIndividualPersonName } from '../../utils/personNameValidation';
import { discoverRelationshipHints, enrichEntity } from './lexicalIntelligence';
import {
  hasVicariousRomanticSignals,
  parseVicariousEpisode,
  type VicariousRomanticHit,
} from './vicariousRomanticIntelligence';

export type RelationshipPeripheryDomain =
  | 'romantic'
  | 'family'
  | 'social'
  | 'professional'
  | 'mentor'
  | 'adversarial'
  | 'creative';

export type VicariousTier = 'suspected' | 'confirmed';

export interface VicariousRelationshipHit {
  domain: RelationshipPeripheryDomain;
  subjectName: string;
  objectName: string | null;
  objectSurface: string;
  role: string;
  tier: VicariousTier;
  confidence: number;
  evidence: string;
  cues: string[];
  ontologyTags: string[];
  hasMet: boolean;
  proximity: 'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party';
}

const norm = (s: string) => (s ?? '').toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();

const FAMILY_CUES = [
  "'s mom", "'s dad", "'s mother", "'s father", "'s sister", "'s brother",
  "'s parents", "'s cousin", "'s aunt", "'s uncle", "'s wife", "'s husband",
  'stepmom', 'stepdad', 'step-mom', 'step-dad', 'in-law', 'mother-in-law',
];

const SOCIAL_CUES = [
  "'s roommate", "'s best friend", "'s friend", 'friend from', 'mutual friend',
  'lives with', 'hangs out with',
];

const PROFESSIONAL_CUES = [
  "'s manager", "'s boss", "'s coworker", "'s colleague", 'works with',
  'reports to', 'business partner', "'s client", "'s assistant",
];

const MENTOR_CUES = [
  "'s coach", "'s therapist", "'s mentor", "'s professor", "'s teacher",
  'therapist', 'life coach', 'career coach', 'counselor',
];

const ADVERSARIAL_CUES = [
  "'s lawyer", "'s ally", 'turned them against', 'beef with', 'rival',
  'enemy of', 'fell out with', 'their friend who hates',
];

const CREATIVE_CUES = [
  "'s agent", "'s manager", 'gallery rep', 'bandmate', 'producer',
  'collaborator', 'co-writer', 'creative partner', 'art dealer',
];

const CONFIRM_CUES = [
  'i met', "i've met", 'we met', 'confirmed', 'definitely', 'they are close',
];

type DomainPattern = {
  domain: RelationshipPeripheryDomain;
  re: RegExp;
  subjectIdx: number;
  objectIdx?: number;
  objectFallback?: string;
  role: string;
  weight: number;
};

const DOMAIN_PATTERNS: DomainPattern[] = [
  {
    domain: 'family',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(?:sister|brother|cousin|aunt|uncle|mom|dad|mother|father)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\b/gi,
    subjectIdx: 1,
    objectIdx: 2,
    role: 'extended_family',
    weight: 0.86,
  },
  {
    domain: 'family',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(mom|dad|mother|father|sister|brother|cousin|aunt|uncle|parents)\b/gi,
    subjectIdx: 1,
    objectFallback: 'family member',
    role: 'extended_family',
    weight: 0.84,
  },
  {
    domain: 'family',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(?:step)?(?:mom|dad|mother|father|parent)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)?/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'step-parent',
    role: 'step_parent',
    weight: 0.82,
  },
  {
    domain: 'social',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(?:best\s+)?friend(?:\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+))?/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'close friend',
    role: 'close_friend',
    weight: 0.83,
  },
  {
    domain: 'social',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+roommate(?:\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+))?/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'roommate',
    role: 'roommate',
    weight: 0.86,
  },
  {
    domain: 'professional',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(?:new\s+)?(?:manager|boss|supervisor)\b/gi,
    subjectIdx: 1,
    objectFallback: 'manager',
    role: 'manager',
    weight: 0.85,
  },
  {
    domain: 'professional',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(?:coworker|colleague)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)?/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'coworker',
    role: 'colleague',
    weight: 0.84,
  },
  {
    domain: 'professional',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+(?:works with|reports to)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\b/gi,
    subjectIdx: 1,
    objectIdx: 2,
    role: 'colleague',
    weight: 0.82,
  },
  {
    domain: 'mentor',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(?:coach|therapist|mentor|professor|teacher|counselor)\b/gi,
    subjectIdx: 1,
    objectFallback: 'mentor figure',
    role: 'mentor',
    weight: 0.84,
  },
  {
    domain: 'mentor',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+(?:sees|talks to)\s+(?:a\s+)?(?:therapist|coach|counselor)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)?/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'therapist',
    role: 'therapist',
    weight: 0.8,
  },
  {
    domain: 'adversarial',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(?:lawyer|ally|friend who)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)?/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'conflict ally',
    role: 'ally',
    weight: 0.83,
  },
  {
    domain: 'adversarial',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+friend\s+turned\s+(?:them|her|him)\s+against\b/gi,
    subjectIdx: 1,
    objectFallback: 'instigator',
    role: 'instigator',
    weight: 0.88,
  },
  {
    domain: 'creative',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(?:agent|producer|bandmate|collaborator|co-writer)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)?/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'creative partner',
    role: 'collaborator',
    weight: 0.85,
  },
  {
    domain: 'creative',
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+(?:works with|collaborates with)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+on\s+(?:the\s+)?(?:album|book|film|show)/gi,
    subjectIdx: 1,
    objectIdx: 2,
    role: 'collaborator',
    weight: 0.86,
  },
];

function snippetAround(text: string, cue: string, maxLen = 160): string {
  const lower = norm(text);
  const idx = lower.indexOf(cue.toLowerCase());
  if (idx < 0) return text.trim().slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + cue.length + 80);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

function inferProximity(text: string, objectName: string | null): VicariousRelationshipHit['proximity'] {
  const t = norm(text);
  if (/\b(i met|i've met|we met|in person)\b/.test(t) && objectName) return 'direct';
  if (/\b(never met|haven't met|don't know them)\b/.test(t)) return 'unmet';
  if (/\b(i heard|apparently|someone said)\b/.test(t)) return 'third_party';
  return objectName ? 'indirect' : 'third_party';
}

function hasMet(text: string): boolean {
  return /\b(i met|i've met|we met|saw them|in person)\b/i.test(text);
}

function romanticToHit(hit: VicariousRomanticHit): VicariousRelationshipHit {
  return {
    domain: 'romantic',
    subjectName: hit.subjectName,
    objectName: hit.objectName,
    objectSurface: hit.objectSurface,
    role: hit.role,
    tier: hit.tier,
    confidence: hit.confidence,
    evidence: hit.evidence,
    cues: hit.cues,
    ontologyTags: hit.ontologyTags,
    hasMet: hit.hasMet,
    proximity: hit.proximity,
  };
}

export function hasVicariousRelationshipSignals(text: string): boolean {
  if (hasVicariousRomanticSignals(text)) return true;
  const t = norm(text);
  return (
    FAMILY_CUES.some((c) => t.includes(c)) ||
    SOCIAL_CUES.some((c) => t.includes(c)) ||
    PROFESSIONAL_CUES.some((c) => t.includes(c)) ||
    MENTOR_CUES.some((c) => t.includes(c)) ||
    ADVERSARIAL_CUES.some((c) => t.includes(c)) ||
    CREATIVE_CUES.some((c) => t.includes(c)) ||
    DOMAIN_PATTERNS.some((p) => {
      const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`);
      return re.test(text);
    })
  );
}

export function parseVicariousRelationships(
  text: string,
  anchorNames: string[] = []
): VicariousRelationshipHit[] {
  if (!text?.trim() || !hasVicariousRelationshipSignals(text)) return [];

  const hits: VicariousRelationshipHit[] = [];

  for (const romantic of parseVicariousEpisode(text, anchorNames)) {
    hits.push(romanticToHit(romantic));
  }

  const relHints = discoverRelationshipHints(text);
  const cues = [
    ...relHints.map((h) => h.cue),
    ...FAMILY_CUES.filter((c) => norm(text).includes(c)),
    ...SOCIAL_CUES.filter((c) => norm(text).includes(c)),
    ...PROFESSIONAL_CUES.filter((c) => norm(text).includes(c)),
    ...MENTOR_CUES.filter((c) => norm(text).includes(c)),
    ...ADVERSARIAL_CUES.filter((c) => norm(text).includes(c)),
    ...CREATIVE_CUES.filter((c) => norm(text).includes(c)),
  ];

  for (const pattern of DOMAIN_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags.includes('g') ? pattern.re.flags : `${pattern.re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const subjectName = m[pattern.subjectIdx]?.trim() || anchorNames[0];
      if (!subjectName) continue;

      const rawObject = pattern.objectIdx ? m[pattern.objectIdx]?.trim() : undefined;
      const objectName = rawObject && isIndividualPersonName(rawObject) ? rawObject : null;
      const objectSurface = objectName ?? rawObject ?? pattern.objectFallback ?? 'someone';

      let tier: VicariousTier = 'suspected';
      if (CONFIRM_CUES.some((c) => norm(text).includes(c))) tier = 'confirmed';

      const enrichment = enrichEntity(objectSurface, text);
      hits.push({
        domain: pattern.domain,
        subjectName,
        objectName,
        objectSurface,
        role: pattern.role,
        tier,
        confidence: Math.min(0.95, pattern.weight + (tier === 'confirmed' ? 0.05 : 0)),
        evidence: snippetAround(text, cues[0] ?? objectSurface),
        cues: [...new Set(cues)].slice(0, 6),
        ontologyTags: [`RELATIONSHIP/VICARIOUS/${pattern.domain.toUpperCase()}`, ...enrichment.ontologyTags],
        hasMet: hasMet(text),
        proximity: inferProximity(text, objectName),
      });
    }
  }

  const deduped = new Map<string, VicariousRelationshipHit>();
  for (const hit of hits) {
    const key = `${hit.domain}:${normalizeNameKey(hit.subjectName)}:${normalizeNameKey(hit.objectSurface)}`;
    const prev = deduped.get(key);
    if (!prev || hit.confidence > prev.confidence) deduped.set(key, hit);
  }
  return [...deduped.values()];
}
