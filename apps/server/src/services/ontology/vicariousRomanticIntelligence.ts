/**
 * Vicarious romantic intelligence — parses other partners/lovers a subject
 * person may have ("Alex's ex", "she's seeing someone", "Sam was texting Marcus").
 */
import { normalizeNameKey } from '../../utils/nameNormalization';
import { isIndividualPersonName } from '../../utils/personNameValidation';
import { discoverRelationshipHints, enrichEntity } from './lexicalIntelligence';

const norm = (s: string) => (s ?? '').toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();

export type VicariousTier = 'suspected' | 'confirmed';
export type VicariousRole =
  | 'side_partner'
  | 'current_partner'
  | 'ex'
  | 'crush'
  | 'hookup'
  | 'rival'
  | 'unknown';

export interface VicariousRomanticHit {
  subjectName: string;
  objectName: string | null;
  objectSurface: string;
  role: VicariousRole;
  tier: VicariousTier;
  confidence: number;
  evidence: string;
  cues: string[];
  ontologyTags: string[];
  hasMet: boolean;
  proximity: 'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party';
}

const JUNK = new Set(['me', 'myself', 'you', 'i', 'we', 'they', 'her', 'him', 'someone', 'somebody']);

const VICARIOUS_CUES = [
  'cheating on', 'seeing someone else', 'talking to other', 'texting another',
  'seeing another', 'with someone else', 'her ex', 'his ex', 'their ex',
  'new boyfriend', 'new girlfriend', 'new partner', 'side piece',
  'other guy', 'other girl', 'another man', 'another woman', 'some guy', 'some girl',
  'apparently they', 'i heard she', 'i heard he', 'she admitted', 'he admitted',
  'they are together', "they're together", 'dating someone', 'hooking up with',
];

const CONFIRM_CUES = [
  'they are together', "they're together", 'yeah they', 'she admitted', 'he admitted',
  'i met him', 'i met her', 'confirmed', 'definitely seeing',
];

const SUBJECT_OBJECT_PATTERNS: Array<{
  re: RegExp;
  subjectIdx: number;
  objectIdx?: number;
  objectFallback?: string;
  role: VicariousRole;
  tier: VicariousTier;
  weight: number;
}> = [
  {
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+(?:new\s+)?(?:boyfriend|girlfriend|partner|lover|ex)\b/gi,
    subjectIdx: 1,
    objectFallback: 'unnamed partner',
    role: 'current_partner',
    tier: 'suspected',
    weight: 0.82,
  },
  {
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+(?:was|is)\s+(?:texting|seeing|dating|hooking up with)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\b/gi,
    subjectIdx: 1,
    objectIdx: 2,
    role: 'side_partner',
    tier: 'suspected',
    weight: 0.85,
  },
  {
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+(?:cheated|is cheating)\s+(?:on me|with)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)?/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'someone else',
    role: 'side_partner',
    tier: 'suspected',
    weight: 0.88,
  },
  {
    re: /\b(she|he)\s+(?:is\s+)?(?:seeing|dating)\s+(?:someone|another\s+(?:guy|man|person)|([A-ZÀ-Ý][a-zà-ÿ'’.-]+))/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'someone else',
    role: 'side_partner',
    tier: 'suspected',
    weight: 0.78,
  },
  {
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+and\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+(?:are|were)\s+together\b/gi,
    subjectIdx: 1,
    objectIdx: 2,
    role: 'current_partner',
    tier: 'confirmed',
    weight: 0.86,
  },
  {
    re: /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)'s\s+ex(?:\s+|-)([A-ZÀ-Ý][a-zà-ÿ'’.-]+)?/gi,
    subjectIdx: 1,
    objectIdx: 2,
    objectFallback: 'ex partner',
    role: 'ex',
    tier: 'suspected',
    weight: 0.8,
  },
];

function inferProximity(text: string, objectName: string | null): VicariousRomanticHit['proximity'] {
  const t = norm(text);
  if (/\b(i met|i've met|we met|in person)\b/.test(t) && objectName) return 'direct';
  if (/\b(never met|haven't met|don't know them|no idea who)\b/.test(t)) return 'unmet';
  if (/\b(i heard|apparently|someone said|they said)\b/.test(t)) return 'third_party';
  if (objectName) return 'indirect';
  return 'third_party';
}

function hasMet(text: string): boolean {
  return /\b(i met|i've met|we met|saw them|in person)\b/i.test(text);
}

function snippetAround(text: string, cue: string, maxLen = 160): string {
  const lower = norm(text);
  const idx = lower.indexOf(cue.toLowerCase());
  if (idx < 0) return text.trim().slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + cue.length + 80);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

export function hasVicariousRomanticSignals(text: string): boolean {
  const t = norm(text);
  if (VICARIOUS_CUES.some((c) => t.includes(c))) return true;
  return SUBJECT_OBJECT_PATTERNS.some((p) => {
    const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`);
    return re.test(text);
  });
}

function addName(raw: string | undefined, names: Set<string>) {
  if (!raw?.trim()) return;
  const name = raw.trim();
  const key = normalizeNameKey(name);
  if (JUNK.has(key) || !isIndividualPersonName(name)) return;
  names.add(name);
}

/** Extract anchor subject names already known from user-centric romantic context. */
export function extractAnchorCandidates(text: string, knownNames: string[] = []): string[] {
  const found = new Set<string>();
  for (const name of knownNames) {
    if (text.includes(name)) found.add(name);
  }
  const proper = /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+){0,2})\b/g;
  let m: RegExpExecArray | null;
  const lower = norm(text);
  while ((m = proper.exec(text)) !== null) {
    const name = m[1];
    const window = lower.slice(Math.max(0, m.index - 60), m.index + 60);
    if (
      /'s\s+(?:ex|boyfriend|girlfriend|partner|lover|new)/.test(window) ||
      /\b(was|is)\s+(?:texting|seeing|dating|cheating)/.test(window) ||
      VICARIOUS_CUES.some((c) => window.includes(c))
    ) {
      addName(name, found);
    }
  }
  return [...found];
}

export function parseVicariousEpisode(
  text: string,
  anchorNames: string[] = []
): VicariousRomanticHit[] {
  if (!text?.trim() || !hasVicariousRomanticSignals(text)) return [];

  const hits: VicariousRomanticHit[] = [];
  const relHints = discoverRelationshipHints(text).filter((h) => h.hint === 'ROMANTIC_RELATIONSHIP');
  const cues = [
    ...relHints.map((h) => h.cue),
    ...VICARIOUS_CUES.filter((c) => norm(text).includes(c)),
  ];

  for (const pattern of SUBJECT_OBJECT_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags.includes('g') ? pattern.re.flags : `${pattern.re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let subjectName = m[pattern.subjectIdx]?.trim();
      if (!subjectName || subjectName.toLowerCase() === 'she' || subjectName.toLowerCase() === 'he') {
        subjectName = anchorNames[0];
      }
      if (!subjectName) continue;

      const rawObject = pattern.objectIdx ? m[pattern.objectIdx]?.trim() : undefined;
      const objectName =
        rawObject && isIndividualPersonName(rawObject) ? rawObject : null;
      const objectSurface = objectName ?? rawObject ?? pattern.objectFallback ?? 'someone else';

      let tier = pattern.tier;
      if (CONFIRM_CUES.some((c) => norm(text).includes(c))) tier = 'confirmed';

      const enrichment = enrichEntity(objectSurface, text);
      hits.push({
        subjectName,
        objectName,
        objectSurface,
        role: pattern.role,
        tier,
        confidence: Math.min(0.95, pattern.weight + (tier === 'confirmed' ? 0.05 : 0)),
        evidence: snippetAround(text, cues[0] ?? objectSurface),
        cues: [...new Set(cues)].slice(0, 6),
        ontologyTags: [
          `ROMANTIC/VICARIOUS/${tier.toUpperCase()}`,
          ...enrichment.ontologyTags,
        ],
        hasMet: hasMet(text),
        proximity: inferProximity(text, objectName),
      });
    }
  }

  const deduped = new Map<string, VicariousRomanticHit>();
  for (const hit of hits) {
    const key = `${normalizeNameKey(hit.subjectName)}:${normalizeNameKey(hit.objectSurface)}`;
    const prev = deduped.get(key);
    if (!prev || hit.confidence > prev.confidence) deduped.set(key, hit);
  }
  return [...deduped.values()];
}
