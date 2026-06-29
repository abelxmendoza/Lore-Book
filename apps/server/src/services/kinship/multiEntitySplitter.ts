/**
 * Split compound entity mentions and expand extraction candidates.
 */
import { extractKinshipMentions } from './kinshipGlossary';
import { classifyEntity, toOmegaType } from '../entities/entityClassifier';
import type { EntityType } from '../../types/omegaMemory';

export type EntityCandidate = { name: string; type: EntityType; kinshipRole?: string; bornConfirmed?: boolean };

const LIST_SPLIT = /\s+(?:,|\band\b|\by\b|\&)\s+/i;

/** Split "Tío Juan and Tío Ray" → ["Tío Juan", "Tío Ray"] */
export function splitCompoundMention(raw: string): string[] {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return [];

  const parts = name.split(LIST_SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return [name];

  return parts.every((p) => /^[A-ZÀ-Ý]/.test(p) || /\b(t[íi]o|t[íi]a|uncle|aunt|abuela|abuelo|mom|dad)\b/i.test(p))
    ? parts
    : [name];
}

/** Expand LLM/deterministic candidates + kinship regex pass. */
export function expandEntityCandidates(
  text: string,
  candidates: Array<{ name: string; type: EntityType }>
): EntityCandidate[] {
  const out: EntityCandidate[] = [];
  const seen = new Set<string>();

  const push = (name: string, type: EntityType, kinshipRole?: string, bornConfirmed?: boolean) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      name: name.trim(),
      type,
      ...(kinshipRole ? { kinshipRole } : {}),
      ...(bornConfirmed ? { bornConfirmed: true } : {}),
    });
  };

  for (const c of candidates) {
    const parts = splitCompoundMention(c.name);
    for (const part of parts) {
      const classification = classifyEntity(part, text);
      const finalType = c.type === 'UNKNOWN' ? (toOmegaType(classification.rootType) as EntityType) : c.type;
      // Born recall-active only when this mention carries positive PERSON
      // evidence in-context (honorific+name, or a person predicate like
      // "Bill texted me"). A bare capitalized phrase with no predicate stays
      // a suggestion-queue candidate — that's how we avoid confirming
      // concept/place look-alikes ("Computer Science", "Discovery Cube").
      const bornConfirmed =
        classification.type === 'PERSON' && (finalType === 'PERSON' || finalType === 'CHARACTER');
      push(part, finalType, undefined, bornConfirmed);
    }
  }

  for (const kin of extractKinshipMentions(text)) {
    const classification = classifyEntity(kin.sourcePhrase, text);
    const type = toOmegaType(classification.rootType);
    if (type === 'PERSON' || type === 'CHARACTER' || type === 'UNKNOWN') {
      // Kinship-with-name ("Tío Juan") classifies PERSON → recall-active;
      // a bare kinship title ("uncle") stays a candidate until named.
      push(kin.sourcePhrase, 'PERSON', kin.role.toLowerCase(), classification.type === 'PERSON');
    }
  }

  return out;
}
