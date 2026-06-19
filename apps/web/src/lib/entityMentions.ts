import type { CertifiedEntityType, CharacterVariant, EntityStatus } from '../types/certifiedEntity';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { findEntityHighlightRanges } from './entityHighlightRanges';

/** Lightweight entity reference for inline UI pills (messages, modals, etc.). */
export type EntityMentionRef = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  characterVariant?: CharacterVariant;
  status?: EntityStatus;
};

export type TextEntitySegment =
  | { kind: 'text'; value: string }
  | { kind: 'entity'; value: string; entity: EntityMentionRef };

export function toCertifiedMatch(ref: EntityMentionRef): CertifiedEntityMatch {
  return {
    id: ref.id,
    name: ref.name,
    type: ref.type,
    aliases: [],
    mentionKeys: [],
    matchedLabel: ref.name,
    matchKind: 'full',
    status: ref.status ?? 'confirmed',
    characterVariant: ref.characterVariant,
  };
}

export function splitTextWithEntityMentions(
  text: string,
  entities: EntityMentionRef[]
): TextEntitySegment[] {
  if (!text) return [];
  if (!entities.length) return [{ kind: 'text', value: text }];

  const byId = new Map(entities.map((e) => [e.id, e]));
  const ranges = findEntityHighlightRanges(
    text,
    entities.map(toCertifiedMatch)
  );

  if (ranges.length === 0) return [{ kind: 'text', value: text }];

  const segments: TextEntitySegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, range.start) });
    }
    const entity = byId.get(range.match.id) ?? {
      id: range.match.id,
      name: range.match.name,
      type: range.match.type,
      characterVariant: range.match.characterVariant,
      status: range.match.status,
    };
    segments.push({
      kind: 'entity',
      value: text.slice(range.start, range.end),
      entity,
    });
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }

  return segments;
}

/** Dedupe entity refs by id — later entries win on name/type updates. */
export function mergeEntityMentionRefs(...lists: Array<EntityMentionRef[] | undefined>): EntityMentionRef[] {
  const map = new Map<string, EntityMentionRef>();
  for (const list of lists) {
    for (const entity of list ?? []) {
      if (!entity?.id || !entity.name) continue;
      map.set(entity.id, entity);
    }
  }
  return [...map.values()];
}

export function entityMentionsFromMessage(
  message: { mentionedEntities?: Array<{ id: string; name: string; type: EntityMentionRef['type']; characterVariant?: CharacterVariant }> }
): EntityMentionRef[] {
  return (message.mentionedEntities ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    characterVariant: e.characterVariant,
    status: 'confirmed' as const,
  }));
}
