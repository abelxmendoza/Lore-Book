/**
 * Evidence-backed relationship dimension extraction (deterministic).
 * Never infers emotional closeness without explicit language.
 */

export type RelationshipDimension =
  | 'coworker'
  | 'manager'
  | 'report'
  | 'mentor'
  | 'mentee'
  | 'friend'
  | 'family'
  | 'romantic_interest'
  | 'former_coworker'
  | 'teacher'
  | 'student'
  | 'client'
  | 'recruiter'
  | 'roommate'
  | 'neighbor'
  | 'acquaintance'
  | 'recurring_interaction';

export type RelationshipDimensionHit = {
  personHint: string;
  dimension: RelationshipDimension;
  evidence: string;
  confidence: number;
  /** Explicit only — never guessed */
  frequencyHint?: 'once' | 'recurring' | 'ongoing' | 'former';
  sharedProjectHint?: string;
};

type Pattern = {
  re: RegExp;
  dimension: RelationshipDimension;
  conf: number;
  personGroup: number;
  frequency?: RelationshipDimensionHit['frequencyHint'];
  projectGroup?: number;
};

// Person name is capture group; dimension from pattern.
const PATTERNS: Pattern[] = [
  { re: /\b([A-Z][\w'.-]+)\s+(?:is|was)\s+my\s+(?:manager|boss|supervisor)\b/gi, dimension: 'manager', conf: 0.92, personGroup: 1 },
  { re: /\bmy\s+(?:manager|boss|supervisor)\s+([A-Z][\w'.-]+)\b/gi, dimension: 'manager', conf: 0.9, personGroup: 1 },
  { re: /\b([A-Z][\w'.-]+)\s+(?:reports|reported)\s+to me\b/gi, dimension: 'report', conf: 0.9, personGroup: 1 },
  { re: /\b([A-Z][\w'.-]+)\s+(?:is|was)\s+my\s+(?:mentor|coach)\b/gi, dimension: 'mentor', conf: 0.92, personGroup: 1 },
  { re: /\bI\s+(?:mentor|coached|taught)\s+([A-Z][\w'.-]+)\b/gi, dimension: 'mentee', conf: 0.86, personGroup: 1 },
  { re: /\b([A-Z][\w'.-]+)\s+(?:is|was)\s+my\s+(?:coworker|colleague|teammate)\b/gi, dimension: 'coworker', conf: 0.9, personGroup: 1 },
  { re: /\b(?:work|worked|working)\s+with\s+([A-Z][\w'.-]+)\b/gi, dimension: 'coworker', conf: 0.78, personGroup: 1 },
  { re: /\bformer\s+(?:coworker|colleague)\s+([A-Z][\w'.-]+)\b/gi, dimension: 'former_coworker', conf: 0.9, personGroup: 1, frequency: 'former' },
  { re: /\b([A-Z][\w'.-]+)\s+(?:used to|formerly)\s+work(?:ed)?\s+with\b/gi, dimension: 'former_coworker', conf: 0.86, personGroup: 1, frequency: 'former' },
  { re: /\bmy\s+friend\s+([A-Z][\w'.-]+)\b/gi, dimension: 'friend', conf: 0.9, personGroup: 1 },
  { re: /\b([A-Z][\w'.-]+)\s+(?:is|was)\s+a\s+friend\b/gi, dimension: 'friend', conf: 0.86, personGroup: 1 },
  { re: /\bmy\s+(?:mom|dad|mother|father|sister|brother|t[ií]a|t[ií]o|cousin|grandma|grandpa|abuela|abuelo)\s+([A-Z][\w'.-]+)?\b/gi, dimension: 'family', conf: 0.92, personGroup: 1 },
  { re: /\b([A-Z][\w'.-]+)\s+(?:is|was)\s+my\s+(?:mom|dad|sister|brother|t[ií]a|t[ií]o|cousin)\b/gi, dimension: 'family', conf: 0.92, personGroup: 1 },
  { re: /\b(?:dating|seeing|hooked up with|romantic interest)\s+([A-Z][\w'.-]+)\b/gi, dimension: 'romantic_interest', conf: 0.88, personGroup: 1 },
  { re: /\b([A-Z][\w'.-]+)\s+(?:and I|and me)\s+(?:are|were)\s+dating\b/gi, dimension: 'romantic_interest', conf: 0.9, personGroup: 1 },
  { re: /\bmy\s+(?:teacher|professor)\s+([A-Z][\w'.-]+)\b/gi, dimension: 'teacher', conf: 0.9, personGroup: 1 },
  { re: /\bI\s+(?:taught|teach)\s+([A-Z][\w'.-]+)\b/gi, dimension: 'student', conf: 0.8, personGroup: 1 },
  { re: /\b([A-Z][\w'.-]+)\s+(?:is|was)\s+(?:a |my )?client\b/gi, dimension: 'client', conf: 0.86, personGroup: 1 },
  { re: /\b([A-Z][\w'.-]+)\s+(?:recruited|recruits)\s+(?:me|for)\b/gi, dimension: 'recruiter', conf: 0.88, personGroup: 1 },
  { re: /\bmy\s+roommate\s+([A-Z][\w'.-]+)\b/gi, dimension: 'roommate', conf: 0.92, personGroup: 1 },
  { re: /\bmy\s+neighbor\s+([A-Z][\w'.-]+)\b/gi, dimension: 'neighbor', conf: 0.9, personGroup: 1 },
  { re: /\bI\s+(?:keep|kept)\s+(?:running into|seeing)\s+([A-Z][\w'.-]+)\b/gi, dimension: 'recurring_interaction', conf: 0.8, personGroup: 1, frequency: 'recurring' },
  { re: /\b([A-Z][\w'.-]+)\s+and I\s+(?:always|often|usually|every week)\b/gi, dimension: 'recurring_interaction', conf: 0.82, personGroup: 1, frequency: 'recurring' },
  { re: /\bworking on\s+([^.!?]{2,40})\s+with\s+([A-Z][\w'.-]+)\b/gi, dimension: 'coworker', conf: 0.84, personGroup: 2, projectGroup: 1 },
];

// Explicit trust language only
const TRUST_RE =
  /\bI\s+(?:trust|trusted|don't trust|do not trust)\s+([A-Z][\w'.-]+)\b/gi;

export function extractRelationshipDimensions(text: string): RelationshipDimensionHit[] {
  const raw = text?.trim() ?? '';
  if (raw.length < 6) return [];

  const hits: RelationshipDimensionHit[] = [];
  const seen = new Set<string>();

  for (const p of PATTERNS) {
    const flags = p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`;
    const re = new RegExp(p.re.source, flags);
    for (const m of raw.matchAll(re)) {
      let person = (m[p.personGroup] || '').trim();
      // Family patterns may omit name (e.g. "my tía")
      if (!person && p.dimension === 'family') {
        person = m[0].replace(/\bmy\s+/i, '').trim().slice(0, 40);
      }
      if (!person || person.length < 2) continue;
      // Skip common false positives
      if (/^(I|The|A|An|My|We|They|This|That)$/i.test(person)) continue;

      const evidence = m[0].trim().slice(0, 160);
      const key = `${person.toLowerCase()}|${p.dimension}|${evidence.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      hits.push({
        personHint: person,
        dimension: p.dimension,
        evidence,
        confidence: p.conf,
        frequencyHint: p.frequency,
        sharedProjectHint: p.projectGroup ? (m[p.projectGroup] || '').trim().slice(0, 60) : undefined,
      });
    }
  }

  for (const m of raw.matchAll(new RegExp(TRUST_RE.source, 'gi'))) {
    const person = (m[1] || '').trim();
    if (!person) continue;
    const evidence = m[0].trim();
    const negative = /don'?t trust|do not trust/i.test(evidence);
    hits.push({
      personHint: person,
      dimension: 'acquaintance',
      evidence,
      confidence: negative ? 0.88 : 0.9,
    });
  }

  return hits;
}
