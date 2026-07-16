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

export type CollectThreadEntitiesOptions = {
  /**
   * Only count mentions in the last N messages. Prevents one early mention
   * (e.g. "Ink" from a music thread) from sticking above the composer forever
   * after the conversation has moved on.
   * Default: entire thread. Composer strip uses a recent window.
   */
  recentMessageWindow?: number;
  /** Cap how many entities to return (most relevant first). */
  max?: number;
};

/** Aggregate confirmed entities surfaced across a thread's messages (most-mentioned first). */
export function collectThreadEntities(
  messages: Message[],
  options: CollectThreadEntitiesOptions = {},
): ThreadEntity[] {
  const windowSize = options.recentMessageWindow;
  const start =
    windowSize != null && windowSize > 0
      ? Math.max(0, messages.length - windowSize)
      : 0;
  const slice = start > 0 ? messages.slice(start) : messages;

  const byId = new Map<string, ThreadEntity & { count: number; lastIndex: number }>();
  slice.forEach((m, offset) => {
    const i = start + offset;
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

  const ranked = [...byId.values()].sort(
    (a, b) => b.count - a.count || b.lastIndex - a.lastIndex,
  );
  const limited =
    options.max != null && options.max > 0 ? ranked.slice(0, options.max) : ranked;

  return limited.map(({ id, name, type, characterVariant, loreKind }) => ({
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
