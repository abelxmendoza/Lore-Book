import type { Message } from '../message/ChatMessage';

export type ThreadEntity = {
  id: string;
  name: string;
  type: 'character' | 'location' | 'organization';
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
      } else {
        byId.set(e.id, { ...e, count: 1, lastIndex: i });
      }
    }
  });
  return [...byId.values()]
    .sort((a, b) => b.count - a.count || b.lastIndex - a.lastIndex)
    .map(({ id, name, type }) => ({ id, name, type }));
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
