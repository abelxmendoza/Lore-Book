/**
 * Rebuild person–place links from explicit predicates only.
 * Same-message co-occurrence is not enough.
 */

import { hasPlaceParticipation } from '../../locations/placePresenceSemantics';
import type { PersonPlaceRelation } from './placeMigrationTypes';

export type CandidatePersonLink = {
  name: string;
  characterId?: string | null;
  verified?: boolean;
};

export type RebuiltPersonLink = {
  name: string;
  characterId?: string | null;
  relation: PersonPlaceRelation;
  keep: boolean;
  reason: string;
};

const MALFORMED_PERSON = /^(?:.+['']s|.+\s+['']s)$/i;
const NON_PERSON_LABELS = new Set([
  'cyberpunk',
  'technology',
  'ui',
  'design',
  'coding',
  'employment',
  'gaming',
  'celebration',
]);

function normalize(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function inferRelation(personName: string, placeName: string, evidenceText: string): PersonPlaceRelation | null {
  const text = evidenceText.toLowerCase();
  const person = normalize(personName);
  const place = normalize(placeName);
  if (!person || !place) return null;

  if (new RegExp(`\\b${escape(person)}\\b(?:\\s+\\w+){0,4}\\s+(?:graduated from|studied at|attended)\\s+${escape(place)}\\b`, 'i').test(evidenceText)) {
    return /graduated/i.test(text) ? 'GRADUATED_FROM' : 'STUDIED_AT';
  }
  if (new RegExp(`\\b${escape(person)}\\b(?:\\s+\\w+){0,4}\\s+(?:lives?|lived|living)\\s+(?:at|in)\\s+${escape(place)}\\b`, 'i').test(evidenceText)) {
    return 'LIVED_AT';
  }
  if (new RegExp(`\\b${escape(person)}\\b(?:\\s+\\w+){0,4}\\s+(?:works?|worked|working)\\s+(?:at|in)\\s+${escape(place)}\\b`, 'i').test(evidenceText)) {
    return 'WORKED_AT';
  }
  if (hasPlaceParticipation(personName, placeName, evidenceText)) {
    if (/\bmet\b/i.test(evidenceText)) return 'MET_AT';
    if (/\bwith\b/i.test(evidenceText)) return 'TRAVELED_WITH';
    return 'VISITED';
  }
  return null;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filter candidate people attached to a place using evidence text.
 */
export function rebuildPersonPlaceLinks(
  placeName: string,
  candidates: CandidatePersonLink[],
  evidenceTexts: string[],
): { kept: RebuiltPersonLink[]; removed: string[]; addedRelationships: string[] } {
  const kept: RebuiltPersonLink[] = [];
  const removed: string[] = [];
  const addedRelationships: string[] = [];
  const blob = evidenceTexts.join('\n');

  for (const candidate of candidates) {
    const name = (candidate.name ?? '').trim();
    if (!name) continue;
    const key = normalize(name);

    if (MALFORMED_PERSON.test(name) || /['']s$/.test(name.trim())) {
      removed.push(name);
      continue;
    }
    if (NON_PERSON_LABELS.has(key)) {
      removed.push(name);
      continue;
    }

    if (candidate.verified && candidate.characterId) {
      kept.push({
        name,
        characterId: candidate.characterId,
        relation: 'MENTIONED_IN_CONTEXT_OF',
        keep: true,
        reason: 'verified_character_link',
      });
      addedRelationships.push(`${name}:MENTIONED_IN_CONTEXT_OF(verified)`);
      continue;
    }

    const relation = inferRelation(name, placeName, blob);
    if (!relation || relation === 'MENTIONED_IN_CONTEXT_OF') {
      // Same-message co-occurrence without predicate → drop.
      removed.push(name);
      continue;
    }

    kept.push({
      name,
      characterId: candidate.characterId,
      relation,
      keep: true,
      reason: 'explicit_predicate',
    });
    addedRelationships.push(`${name}:${relation}`);
  }

  return { kept, removed, addedRelationships };
}
