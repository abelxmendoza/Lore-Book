/**
 * Unified mention index: confirmed book entities + pending suggestions.
 * Powers chat composer chips and entity recall by stable id.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { characterSuggestionId, locationSuggestionId } from '../../utils/entitySuggestionId';
import { characterSuggestionService } from '../characterSuggestionService';
import { locationSuggestionService } from '../locationSuggestionService';
import { skillSuggestionService } from '../skills/skillSuggestionService';
import { groupCandidateService } from '../groupCandidateService';
import {
  listCertifiedEntities,
  matchCertifiedEntitiesInText,
  matchCertifiedEntitiesInTextDetailed,
  type CertifiedEntity,
  type CertifiedEntityType,
} from './certifiedEntityIndexService';

export type EntityStatus = 'confirmed' | 'suggestion';

export type MentionableEntity = CertifiedEntity & {
  status: EntityStatus;
};

function mentionKeysForName(name: string): string[] {
  const key = normalizeNameKey(name);
  return key ? [key] : [];
}

function isNameCoveredByConfirmed(name: string, confirmed: CertifiedEntity[]): boolean {
  const norm = normalizeNameKey(name);
  if (!norm) return true;
  return confirmed.some(
    (e) => e.mentionKeys.includes(norm) || normalizeNameKey(e.name) === norm
  );
}

function pushUnique(map: Map<string, MentionableEntity>, entity: MentionableEntity): void {
  const slot = `${entity.type}:${entity.id}`;
  if (!map.has(slot)) map.set(slot, entity);
}

function groupCandidateDisplayName(members: string[], proposed?: string): string {
  if (proposed?.trim()) return proposed.trim();
  if (members.length === 0) return 'New Group';
  if (members.length === 1) return `${members[0]}'s Group`;
  const first = members.slice(0, 2).map((m) => m.split(' ')[0]);
  return `${first.join(' & ')} Crew`;
}

export async function listMentionableEntities(userId: string): Promise<MentionableEntity[]> {
  const [confirmed, charSuggestions, locSuggestions, skillSuggestions, groupCandidates] =
    await Promise.all([
      listCertifiedEntities(userId),
      characterSuggestionService.getSuggestions(userId).catch(() => []),
      locationSuggestionService.getSuggestions(userId).catch(() => []),
      skillSuggestionService.getPendingSuggestions(userId).catch(() => []),
      groupCandidateService.getCandidates(userId, 'pending').catch(() => []),
    ]);

  const map = new Map<string, MentionableEntity>();

  for (const entity of confirmed) {
    pushUnique(map, {
      ...entity,
      status: 'confirmed',
    });
  }

  for (const s of charSuggestions) {
    if (isNameCoveredByConfirmed(s.name, confirmed)) continue;
    const id = characterSuggestionId(s);
    const isRomantic = s.archetype === 'romantic' || s.relationship === 'romantic';
    pushUnique(map, {
      id,
      name: s.name,
      type: 'character',
      aliases: [],
      mentionKeys: mentionKeysForName(s.name),
      status: 'suggestion',
      ...(isRomantic ? { characterVariant: 'romantic' as const } : {}),
    });
  }

  for (const s of locSuggestions) {
    if (isNameCoveredByConfirmed(s.name, confirmed)) continue;
    const id = locationSuggestionId(s);
    pushUnique(map, {
      id,
      name: s.name,
      type: 'location',
      aliases: [],
      mentionKeys: mentionKeysForName(s.name),
      status: 'suggestion',
    });
  }

  for (const s of skillSuggestions) {
    if (isNameCoveredByConfirmed(s.skill_name, confirmed)) continue;
    pushUnique(map, {
      id: s.id,
      name: s.skill_name,
      type: 'skill',
      aliases: [],
      mentionKeys: mentionKeysForName(s.skill_name),
      status: 'suggestion',
    });
  }

  for (const g of groupCandidates) {
    const name = groupCandidateDisplayName(g.detected_members ?? [], g.proposed_name);
    if (isNameCoveredByConfirmed(name, confirmed)) continue;
    pushUnique(map, {
      id: g.id,
      name,
      type: 'organization',
      aliases: [],
      mentionKeys: mentionKeysForName(name),
      status: 'suggestion',
    });
  }

  return [...map.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'confirmed' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Match mentionable entities in composer text (confirmed + suggestions). */
export function matchMentionableEntitiesInText(
  text: string,
  index: MentionableEntity[]
): MentionableEntity[] {
  return matchCertifiedEntitiesInText(text, index) as MentionableEntity[];
}

export type ComposerEntityPayload = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  status?: EntityStatus;
};

/**
 * Validate client-submitted composer entities against the user's index and draft text.
 * Strips unknown ids and entities not supported by server-side re-match (prevents spoofing).
 */
export function sanitizeComposerEntities(
  message: string,
  submitted: ComposerEntityPayload[] | undefined,
  index: MentionableEntity[]
): MentionableEntity[] {
  if (!submitted?.length) return [];

  const bySlot = new Map(index.map((e) => [`${e.type}:${e.id}`, e]));
  const textMatches = matchCertifiedEntitiesInTextDetailed(message, index);
  const allowed = new Set(textMatches.map((e) => `${e.type}:${e.id}`));

  const seen = new Set<string>();
  const validated: MentionableEntity[] = [];

  for (const entity of submitted) {
    const slot = `${entity.type}:${entity.id}`;
    if (seen.has(slot)) continue;
    if (!allowed.has(slot)) continue;
    const canonical = bySlot.get(slot);
    if (!canonical) continue;
    seen.add(slot);
    validated.push(canonical);
  }

  return validated;
}

export type { CertifiedEntity, CertifiedEntityType };
