import { describe, it, expect } from 'vitest';
import { collectThreadEntities, toEntityContext } from './collectThreadEntities';
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

  it('sorts by mention frequency then recency', () => {
    const marcus = { id: 'c1', name: 'Marcus', type: 'character' as const };
    const juan = { id: 'c2', name: 'Juan', type: 'character' as const };
    const entities = collectThreadEntities([
      assistant('a1', [marcus]),
      assistant('a2', [marcus, juan]),
      assistant('a3', [marcus]),
    ]);
    expect(entities.map((e) => e.name)).toEqual(['Marcus', 'Juan']);
  });

  it('includes organizations in thread entity aggregation', () => {
    const acme = { id: 'o1', name: 'Acme Corp', type: 'organization' as const };
    const entities = collectThreadEntities([assistant('a1', [acme])]);
    expect(entities).toEqual([acme]);
  });
});

describe('toEntityContext', () => {
  it('maps character, location, and organization types', () => {
    expect(toEntityContext({ id: 'c1', name: 'Marcus', type: 'character' })).toEqual({
      type: 'CHARACTER',
      id: 'c1',
    });
    expect(toEntityContext({ id: 'l1', name: 'San Diego', type: 'location' })).toEqual({
      type: 'LOCATION',
      id: 'l1',
    });
    expect(toEntityContext({ id: 'o1', name: 'Acme', type: 'organization' })).toEqual({
      type: 'ENTITY',
      id: 'o1',
    });
  });
});
