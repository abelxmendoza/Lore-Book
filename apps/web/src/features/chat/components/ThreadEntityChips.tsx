import { useMemo } from 'react';
import { EntityChipsRow } from '../message/EntityChipsRow';
import type { Message } from '../message/ChatMessage';

interface ThreadEntityChipsProps {
  messages: Message[];
}

/**
 * Thread-level entity accumulation strip — every entity any message in this
 * thread has surfaced, most-mentioned first. Makes continuity structural and
 * visible: the user watches the thread "learn" people/places as they talk,
 * and sees them still there when they return days later.
 */
export const ThreadEntityChips = ({ messages }: ThreadEntityChipsProps) => {
  const entities = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; type: 'character' | 'location' | 'organization'; count: number; lastIndex: number }>();
    messages.forEach((m, i) => {
      for (const e of m.mentionedEntities ?? []) {
        const existing = byId.get(e.id);
        if (existing) {
          existing.count += 1;
          existing.lastIndex = i;
        } else {
          byId.set(e.id, { ...e, count: 1, lastIndex: i });
        }
      }
    });
    return [...byId.values()]
      .sort((a, b) => b.count - a.count || b.lastIndex - a.lastIndex)
      .map(({ id, name, type }) => ({ id, name, type }));
  }, [messages]);

  if (entities.length === 0) return null;

  return (
    <div className="px-4 pt-1 flex-shrink-0">
      <EntityChipsRow entities={entities} label="this thread knows:" max={8} />
    </div>
  );
};
