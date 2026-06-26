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

  it('keeps creation and stale projection metadata when hydrating durable assistant row', () => {
    const creationOutcomes = [{ mention: 'Maria', action: 'defer' as const, authority: 'core' as const }];
    const staleProjectionHints = [{ id: 'bio-1', type: 'biography_snapshot' as const }];
    const local = [
      msg('assistant-1', 'assistant', 'reply', {
        creationOutcomes,
        creationOutcomeSummary: 'needs clarification on Maria',
        staleProjectionHints,
        staleProjectionSummary: 'life summary outdated',
      }),
    ];
    const server = [
      msg('db-a1', 'assistant', 'reply', {
        creationOutcomes,
        creationOutcomeSummary: 'needs clarification on Maria',
        staleProjectionHints,
        staleProjectionSummary: 'life summary outdated',
      }),
    ];
    const merged = mergeThreadMessages(local, server);
    expect(merged[0].creationOutcomes).toEqual(creationOutcomes);
    expect(merged[0].staleProjectionHints).toEqual(staleProjectionHints);
  });

  it('collapses an optimistic row whose id matches the durable row even when content was reformatted', () => {
    // The optimistic bubble adopted the real DB id on persist, but the server
    // stored a post-processed version of the text. Identity is the id, so this
    // must NOT render as two bubbles.
    const local = [
      msg('user-1', 'user', 'hi'),
      msg('db-a1', 'assistant', 'hi there', { isStreaming: false }),
    ];
    const server = [
      msg('db-u1', 'user', 'hi'),
      msg('db-a1', 'assistant', 'Hi there!'), // reformatted by the server
    ];
    const merged = mergeThreadMessages(local, server);
    const assistants = merged.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0].id).toBe('db-a1');
    expect(assistants[0].content).toBe('Hi there!');
  });

  it('keeps local protocol fields when collapsing an id-matched reformatted row', () => {
    const entities = [{ id: 'c1', name: 'Maria', type: 'character' as const }];
    const local = [msg('db-a1', 'assistant', 'streamed text', { mentionedEntities: entities })];
    const server = [msg('db-a1', 'assistant', 'durable text')];
    const merged = mergeThreadMessages(local, server);
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe('durable text');
    expect(merged[0].mentionedEntities).toEqual(entities);
  });

  it('does not duplicate a streaming assistant row that also carries partial content', () => {
    const local = [
      msg('user-1', 'user', 'question'),
      msg('assistant-1', 'assistant', 'partial...', { isStreaming: true }),
    ];
    const server = [msg('db-u1', 'user', 'question')];
    const merged = mergeThreadMessages(local, server);
    const assistants = merged.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0].isStreaming).toBe(true);
  });

  it('preserves local protocol metadata when server row lacks it', () => {
    const creationOutcomes = [{ mention: 'Juan', action: 'create' as const, entityId: 'c1' }];
    const local = [msg('assistant-1', 'assistant', 'reply', { creationOutcomes })];
    const server = [msg('db-a1', 'assistant', 'reply')];
    const merged = mergeThreadMessages(local, server);
    expect(merged[0].id).toBe('db-a1');
    expect(merged[0].creationOutcomes).toEqual(creationOutcomes);
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
