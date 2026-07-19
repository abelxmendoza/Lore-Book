import type { Message } from '../message/ChatMessage';
import type { CertifiedEntityType, CharacterVariant } from '../../../types/certifiedEntity';
import type { LoreEntityKind } from '../../../lib/loreEntities';
import {
  isBuildingOnWorthy,
  isTranscriptMentionWorthy,
  resolveMentionLifecycleStatus,
  type MentionLifecycleStatus,
} from './mentionLifecycle';

export type ThreadEntity = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  characterVariant?: CharacterVariant;
  loreKind?: LoreEntityKind;
  lifecycleStatus?: MentionLifecycleStatus;
  identityStage?: 'MENTION' | 'CANDIDATE' | 'RESOLVED' | 'CHARACTER' | 'CORE_CHARACTER';
  identityConfidence?: number;
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
      // Building-on strip: only RESOLVED identities (Cast-worthy).
      if (!isBuildingOnWorthy(e.name, e.lifecycleStatus)) continue;
      const lifecycleStatus = resolveMentionLifecycleStatus(e.name, e.lifecycleStatus);
      const existing = byId.get(e.id);
      if (existing) {
        existing.count += 1;
        existing.lastIndex = i;
        existing.name = e.name;
        existing.type = e.type;
        existing.characterVariant = e.characterVariant;
        existing.loreKind = e.loreKind;
        existing.lifecycleStatus = lifecycleStatus;
      } else {
        byId.set(e.id, { ...e, lifecycleStatus, count: 1, lastIndex: i });
      }
    }
  });

  const ranked = [...byId.values()].sort(
    (a, b) => b.count - a.count || b.lastIndex - a.lastIndex,
  );
  const limited =
    options.max != null && options.max > 0 ? ranked.slice(0, options.max) : ranked;

  return limited.map(({ id, name, type, characterVariant, loreKind, lifecycleStatus }) => {
    const out: ThreadEntity = { id, name, type };
    if (characterVariant) out.characterVariant = characterVariant;
    if (loreKind) out.loreKind = loreKind;
    if (lifecycleStatus) out.lifecycleStatus = lifecycleStatus;
    return out;
  });
}

/** Recent non-cast mentions (GROUP / UNRESOLVED) for the Actors panel. */
export function collectRecentThreadMentions(
  messages: Message[],
  options: CollectThreadEntitiesOptions = {},
): ThreadEntity[] {
  const windowSize = options.recentMessageWindow ?? 12;
  const start = Math.max(0, messages.length - windowSize);
  const slice = messages.slice(start);
  const byKey = new Map<string, ThreadEntity & { count: number; lastIndex: number }>();

  slice.forEach((m, offset) => {
    const i = start + offset;
    for (const e of m.mentionedEntities ?? []) {
      const status = resolveMentionLifecycleStatus(e.name, e.lifecycleStatus);
      if (status !== 'GROUP' && status !== 'UNRESOLVED') continue;
      if (!isTranscriptMentionWorthy(e.name, status)) continue;
      const key = e.id || `name:${e.name.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        existing.lastIndex = i;
        existing.name = e.name;
        if (e.identityConfidence != null) {
          existing.identityConfidence = Math.max(
            existing.identityConfidence ?? 0,
            e.identityConfidence,
          );
        }
        if (e.identityStage) existing.identityStage = e.identityStage;
      } else {
        byKey.set(key, {
          id: e.id,
          name: e.name,
          type: e.type,
          characterVariant: e.characterVariant,
          loreKind: e.loreKind,
          lifecycleStatus: status,
          identityStage: e.identityStage,
          identityConfidence: e.identityConfidence,
          count: 1,
          lastIndex: i,
        });
      }
    }
  });

  const ranked = [...byKey.values()].sort(
    (a, b) => b.count - a.count || b.lastIndex - a.lastIndex,
  );
  const max = options.max ?? 6;
  return ranked.slice(0, max).map(
    ({ id, name, type, characterVariant, loreKind, lifecycleStatus, identityStage, identityConfidence }) => ({
      id,
      name,
      type,
      characterVariant,
      loreKind,
      lifecycleStatus,
      identityStage,
      identityConfidence,
    }),
  );
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
