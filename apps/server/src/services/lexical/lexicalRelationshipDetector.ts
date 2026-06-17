/**
 * Relationship role signals from kinship, work, and social cues.
 */
import { discoverRelationshipHints, inferRelationshipRole } from '../ontology/lexicalIntelligence';
import type { LexicalRelationshipSignal, RelationshipRole } from './lexicalTypes';
import { padForScan } from './lexicalNormalizer';

const ROLE_PATTERNS: Array<{ role: RelationshipRole; patterns: RegExp[] }> = [
  { role: 'mother', patterns: [/\bmy\s+mother\b/i, /\bmy\s+mom\b/i, /\bmamá\b/i] },
  { role: 'father', patterns: [/\bmy\s+father\b/i, /\bmy\s+dad\b/i, /\bmy\s+estranged\s+father\b/i, /\bpapá\b/i] },
  { role: 'sibling', patterns: [/\bmy\s+(?:brother|sister|sibling)\b/i] },
  { role: 'cousin', patterns: [/\bmy\s+cousin\b/i] },
  { role: 'close_friend', patterns: [/\bmy\s+best\s+friend\b/i, /\bclose\s+friend\b/i] },
  { role: 'friend', patterns: [/\bmy\s+friend\b/i, /\bgood\s+friend\b/i] },
  { role: 'romantic_partner', patterns: [/\bmy\s+(?:boyfriend|girlfriend|partner|husband|wife)\b/i] },
  { role: 'ex_partner', patterns: [/\bmy\s+ex\b/i, /\bex[-\s]?(?:boyfriend|girlfriend|partner|wife|husband)\b/i] },
  { role: 'coworker', patterns: [/\bmy\s+coworker\b/i, /\bco[-\s]?worker\b/i, /\bcolleague\b/i] },
  { role: 'boss', patterns: [/\bmy\s+boss\b/i, /\bmy\s+manager\b/i] },
  { role: 'mentor', patterns: [/\bmy\s+mentor\b/i] },
  { role: 'student', patterns: [/\bmy\s+student\b/i] },
  { role: 'rival', patterns: [/\bmy\s+rival\b/i, /\b(?:enemy|nemesis)\b/i] },
  { role: 'coach', patterns: [/\bmy\s+coach\b/i] },
  { role: 'teammate', patterns: [/\bmy\s+teammate\b/i, /\bteam\s+mate\b/i] },
  { role: 'promoter', patterns: [/\bpromoter\b/i] },
  { role: 'vendor', patterns: [/\bvendor\b/i] },
  { role: 'community_member', patterns: [/\bcommunity\s+member\b/i] },
  { role: 'acquaintance', patterns: [/\bacquaintance\b/i] },
];

export function detectLexicalRelationships(text: string): LexicalRelationshipSignal[] {
  const signals: LexicalRelationshipSignal[] = [];
  const padded = padForScan(text);

  for (const { role, patterns } of ROLE_PATTERNS) {
    for (const re of patterns) {
      const m = re.exec(text);
      if (!m) continue;
      signals.push({
        role,
        cue: m[0],
        sentiment: /\bestranged\b/i.test(text) ? 'estranged' : 'neutral',
        confidence: 0.82,
      });
      break;
    }
  }

  const inferred = inferRelationshipRole(text);
  if (inferred && !signals.some((s) => s.role === inferred)) {
    signals.push({
      role: inferred as RelationshipRole,
      cue: inferred,
      sentiment: inferred === 'estranged' || padded.includes(' estranged ') ? 'estranged' : 'neutral',
      confidence: 0.75,
    });
  }

  for (const h of discoverRelationshipHints(text)) {
    const role = mapRelationshipHint(h.hint);
    if (!role) continue;
    if (signals.some((s) => s.role === role)) continue;
    signals.push({
      role,
      cue: h.cue,
      sentiment: h.hint === 'ADVERSARIAL_RELATIONSHIP' ? 'estranged' : 'neutral',
      confidence: h.confidence,
    });
  }

  return signals;
}

function mapRelationshipHint(hint: string): RelationshipRole | null {
  switch (hint) {
    case 'FAMILY_RELATIONSHIP': return 'father';
    case 'WORK_RELATIONSHIP': return 'coworker';
    case 'ADVERSARIAL_RELATIONSHIP': return 'rival';
    case 'ROMANTIC_RELATIONSHIP': return 'romantic_partner';
    case 'FRIENDSHIP': return 'friend';
    default: return null;
  }
}
