import { describe, it, expect } from 'vitest';
import { collectThreadEntities } from './collectThreadEntities';
import type { Message } from '../message/ChatMessage';

function assistant(
  id: string,
  entities: Message['mentionedEntities']
): Message {
  return { id, role: 'assistant', content: 'reply', timestamp: new Date(), mentionedEntities: entities };
}

describe('collectThreadEntities', () => {
  it('aggregates entities mentioned across assistant messages in a thread', () => {
    const maya = { id: 'c1', name: 'Tía Maria', type: 'character' as const };
    const sanDiego = { id: 'l1', name: 'San Diego', type: 'location' as const };

    const entities = collectThreadEntities([
      assistant('a1', [maya]),
      assistant('a2', [maya, sanDiego]),
      assistant('a3', [sanDiego]),
    ]);

    expect(entities[0]).toEqual(sanDiego);
    expect(entities[1]).toEqual(maya);
  });

  it('returns empty when no messages surfaced entities', () => {
    expect(collectThreadEntities([])).toEqual([]);
    expect(
      collectThreadEntities([
        { id: 'u1', role: 'user', content: 'hello', timestamp: new Date() },
      ])
    ).toEqual([]);
  });
});
