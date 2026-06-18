import { describe, it, expect } from 'vitest';
import { mapDbMessageRow } from './mapDbMessageRow';

describe('mapDbMessageRow', () => {
  it('hoists mentionedEntities from durable metadata onto the Message', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-1',
      role: 'assistant',
      content: 'That sounds meaningful.',
      created_at: '2026-06-17T12:00:00.000Z',
      metadata: {
        saved_from_stream: true,
        stream_status: 'complete',
        mentionedEntities: [
          { id: 'c1', name: 'Tía Maria', type: 'character' },
          { id: 'l1', name: 'San Diego', type: 'location' },
        ],
      },
    });

    expect(message.mentionedEntities).toEqual([
      { id: 'c1', name: 'Tía Maria', type: 'character' },
      { id: 'l1', name: 'San Diego', type: 'location' },
    ]);
    expect(message.metadata?.mentionedEntities).toBeDefined();
  });

  it('omits mentionedEntities when metadata has none', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-2',
      role: 'assistant',
      content: 'Hello',
      created_at: '2026-06-17T12:00:00.000Z',
      metadata: { saved_from_stream: true },
    });

    expect(message.mentionedEntities).toBeUndefined();
  });

  it('marks hydrated durable rows as saved in the database', () => {
    const message = mapDbMessageRow({
      id: 'user-db-1',
      role: 'user',
      content: 'Hello',
      created_at: '2026-06-17T12:00:00.000Z',
      metadata: {},
    });
    expect(message.persistStatus).toBe('saved');
  });

  it('preserves ontology relationship metadata on durable rows', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-3',
      role: 'assistant',
      content: 'Noted.',
      created_at: '2026-06-17T12:00:00.000Z',
      metadata: {
        ontology_enrichment: {
          relationship_groups: [{ scope: 'FAMILY', entityNames: ['Marcus'] }],
        },
        relationship_persistence: { persisted: 1, skipped: 0, characterEdges: 1, entityEdges: 0 },
      },
    });

    expect(message.metadata?.ontology_enrichment).toEqual({
      relationship_groups: [{ scope: 'FAMILY', entityNames: ['Marcus'] }],
    });
    expect(message.metadata?.relationship_persistence).toEqual({
      persisted: 1,
      skipped: 0,
      characterEdges: 1,
      entityEdges: 0,
    });
  });

  it('hoists creationOutcomes from durable metadata onto the Message', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-4',
      role: 'assistant',
      content: 'reply',
      created_at: '2026-06-17T12:00:00.000Z',
      metadata: {
        creationOutcomes: [{ mention: 'Juan', action: 'create', authority: 'core' }],
        creationOutcomeSummary: 'started a record for Juan',
      },
    });

    expect(message.creationOutcomes).toEqual([{ mention: 'Juan', action: 'create', authority: 'core' }]);
    expect(message.creationOutcomeSummary).toBe('started a record for Juan');
  });

  it('hoists staleProjectionHints from durable metadata onto the Message', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-5',
      role: 'assistant',
      content: 'reply',
      created_at: '2026-06-17T12:00:00.000Z',
      metadata: {
        staleProjectionHints: [{ id: 'bio-1', type: 'biography_snapshot' }],
        staleProjectionSummary: 'life summary outdated',
      },
    });

    expect(message.staleProjectionHints).toEqual([{ id: 'bio-1', type: 'biography_snapshot' }]);
    expect(message.staleProjectionSummary).toBe('life summary outdated');
  });
});
