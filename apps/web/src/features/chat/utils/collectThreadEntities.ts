import type { Message } from '../message/ChatMessage';
import type { CertifiedEntityType, CharacterVariant } from '../../../types/certifiedEntity';
import type { LoreEntityKind } from '../../../lib/loreEntities';

export type ThreadEntity = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  characterVariant?: CharacterVariant;
  loreKind?: LoreEntityKind;
};

/** Aggregate confirmed entities surfaced across a thread's messages (most-mentioned first). */
export function collectThreadEntities(messages: Message[]): ThreadEntity[] {
  const byId = new Map<string, ThreadEntity & { count: number; lastIndex: number }>();
  messages.forEach((m, i) => {
    for (const e of m.mentionedEntities ?? []) {
      const existing = byId.get(e.id);
      if (existing) {
        existing.count += 1;
        existing.lastIndex = i;
        existing.name = e.name;
        existing.type = e.type;
        existing.characterVariant = e.characterVariant;
        existing.loreKind = e.loreKind;
      } else {
        byId.set(e.id, { ...e, count: 1, lastIndex: i });
      }
    }
  });
  return [...byId.values()]
    .sort((a, b) => b.count - a.count || b.lastIndex - a.lastIndex)
    .map(({ id, name, type, characterVariant, loreKind }) => ({
      id,
      name,
      type,
      characterVariant,
      loreKind,
    }));
}

export function toEntityContext(entity: ThreadEntity): {
  type: 'CHARACTER' | 'LOCATION' | 'ENTITY';
  id: string;
} {
  return {
    type:
      entity.type === 'character'
        ? 'CHARACTER'
        : entity.type === 'location'
          ? 'LOCATION'
          : 'ENTITY',
    id: entity.id,
  };
}
