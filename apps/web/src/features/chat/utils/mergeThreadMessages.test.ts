import { describe, expect, it } from 'vitest';
import { mergeThreadMessages, countMissingAssistantTurns } from './mergeThreadMessages';
import type { Message } from '../message/ChatMessage';

function msg(id: string, role: 'user' | 'assistant', content: string, extra?: Partial<Message>): Message {
  return { id, role, content, timestamp: new Date(), ...extra };
}

describe('mergeThreadMessages', () => {
  it('keeps local assistant when server snapshot is user-only', () => {
    const local = [
      msg('user-1', 'user', 'hello'),
      msg('assistant-1', 'assistant', 'hi there'),
    ];
    const server = [msg('db-u1', 'user', 'hello')];
    const merged = mergeThreadMessages(local, server);
    expect(merged.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(merged.find((m) => m.role === 'assistant')?.content).toBe('hi there');
  });

  it('prefers real DB ids over synthetic client ids', () => {
    const local = [msg('assistant-1', 'assistant', 'reply')];
    const server = [msg('db-a1', 'assistant', 'reply')];
    const merged = mergeThreadMessages(local, server);
    expect(merged[0].id).toBe('db-a1');
  });

  it('keeps mentionedEntities when hydrating a durable assistant row over a local stream id', () => {
    const entities = [{ id: 'c1', name: 'Tía Maria', type: 'character' as const }];
    const local = [
      msg('assistant-1', 'assistant', 'reply', { mentionedEntities: entities }),
    ];
    const server = [
      msg('db-a1', 'assistant', 'reply', {
        mentionedEntities: entities,
        metadata: { mentionedEntities: entities },
      }),
    ];
    const merged = mergeThreadMessages(local, server);
    expect(merged[0].id).toBe('db-a1');
    expect(merged[0].mentionedEntities).toEqual(entities);
  });

  it('preserves local mentionedEntities when server row lacks them but local id is kept', () => {
    const entities = [{ id: 'l1', name: 'San Diego', type: 'location' as const }];
    const local = [msg('assistant-1', 'assistant', 'reply', { mentionedEntities: entities })];
    const server = [msg('db-a1', 'assistant', 'reply')];
    const merged = mergeThreadMessages(local, server);
    expect(merged[0].id).toBe('db-a1');
    expect(merged[0].mentionedEntities).toEqual(entities);
  });

  it('promotes persistStatus to saved when server row is durable', () => {
    const local = [msg('assistant-1', 'assistant', 'reply', { persistStatus: 'pending' })];
    const server = [msg('db-a1', 'assistant', 'reply', { persistStatus: 'saved' })];
    const merged = mergeThreadMessages(local, server);
    expect(merged[0].persistStatus).toBe('saved');
  });

  it('retains streaming assistant placeholder', () => {
    const local = [
      msg('user-1', 'user', 'question'),
      msg('assistant-1', 'assistant', '', { isStreaming: true }),
    ];
    const server = [msg('db-u1', 'user', 'question')];
    const merged = mergeThreadMessages(local, server);
    expect(merged.some((m) => m.isStreaming)).toBe(true);
  });

  it('preserves full multi-turn conversation across account reload simulation', () => {
    const ts = (iso: string) => new Date(iso);
    const server = [
      { ...msg('db-u1', 'user', 'Turn 1 question'), timestamp: ts('2026-06-01T00:00:00Z') },
      { ...msg('db-a1', 'assistant', 'Turn 1 answer'), timestamp: ts('2026-06-01T00:00:01Z') },
      { ...msg('db-u2', 'user', 'Turn 2 question'), timestamp: ts('2026-06-01T00:00:02Z') },
      { ...msg('db-a2', 'assistant', 'Turn 2 answer'), timestamp: ts('2026-06-01T00:00:03Z') },
    ];
    const local = [
      { ...msg('local-u1', 'user', 'Turn 1 question'), timestamp: ts('2026-06-01T00:00:00Z') },
      { ...msg('local-a1', 'assistant', 'Turn 1 answer'), timestamp: ts('2026-06-01T00:00:01Z') },
    ];
    const merged = mergeThreadMessages(local, server);
    expect(merged).toHaveLength(4);
    expect(merged.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('handles error-path assistant content without dropping bubble', () => {
    const local = [
      msg('user-1', 'user', 'help'),
      msg('assistant-1', 'assistant', 'Partial response before error'),
    ];
    const server = [msg('db-u1', 'user', 'help')];
    const merged = mergeThreadMessages(local, server);
    expect(merged.find((m) => m.role === 'assistant')?.content).toContain('Partial');
  });

  it('preserves ontology metadata when server row wins fingerprint merge', () => {
    const metadata = {
      ontology_enrichment: {
        relationship_groups: [{ scope: 'FAMILY', entityNames: ['Marcus'] }],
      },
    };
    const local = [msg('assistant-1', 'assistant', 'reply')];
    const server = [msg('db-a1', 'assistant', 'reply', { metadata })];
    const merged = mergeThreadMessages(local, server);
    expect(merged[0].id).toBe('db-a1');
    expect(merged[0].metadata).toEqual(metadata);
  });
});

describe('countMissingAssistantTurns', () => {
  it('detects user-only tail', () => {
    expect(countMissingAssistantTurns([msg('u', 'user', 'a')])).toBe(1);
    expect(
      countMissingAssistantTurns([msg('u', 'user', 'a'), msg('a', 'assistant', 'b')])
    ).toBe(0);
  });
});
