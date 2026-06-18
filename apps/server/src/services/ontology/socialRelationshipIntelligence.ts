/**
 * Social Relationship Intelligence — deterministic friend/ally/acquaintance parsing.
 *
 * Cue vocabulary lives in glossary.ts (SOCIAL_ROLE). Romantic types remain in
 * romanticIntelligence.ts / RELATIONSHIP_VERB entries.
 */
import { socialRoleSpecs } from './glossary';

export interface SocialRoleHit {
  role: string;
  cue: string;
  confidence: number;
  /** False for third-party attribution ("she's my bestie"). */
  attributedToSelf: boolean;
}

const norm = (s: string): string =>
  (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

const SELF_SUBJECT = /\b(i|we|my|our|me)\b/;
const OTHER_SUBJECT =
  /\b(she|he|they|her|him|them|his|their|my (?:mom|mother|dad|father|sister|brother|friend|boss|partner))\b/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when glossary social-role cues appear. */
export function hasSocialRoleSignals(text: string): boolean {
  const padded = ` ${norm(text)} `;
  return socialRoleSpecs().some((spec) =>
    spec.terms.some((term) => padded.includes(` ${term} `))
  );
}

/** Parse social relationship role hits from a message. */
export function parseSocialRoles(text: string): SocialRoleHit[] {
  if (!text?.trim() || !hasSocialRoleSignals(text)) return [];

  const padded = ` ${norm(text)} `;
  const hits: SocialRoleHit[] = [];
  const seenRoles = new Set<string>();

  for (const spec of socialRoleSpecs()) {
    if (seenRoles.has(spec.role)) continue;
    for (const term of spec.terms) {
      const re = new RegExp(`\\b${escapeRe(term)}\\b`, 'i');
      const m = re.exec(text);
      if (!m) continue;

      const cueSpan = text.slice(Math.max(0, m.index - 40), m.index + m[0].length);
      const attributedToSelf = SELF_SUBJECT.test(norm(cueSpan)) && !OTHER_SUBJECT.test(norm(cueSpan));

      hits.push({
        role: spec.role,
        cue: m[0],
        confidence: spec.confidence,
        attributedToSelf,
      });
      seenRoles.add(spec.role);
      break;
    }
  }

  return hits.sort((a, b) => b.confidence - a.confidence);
}
