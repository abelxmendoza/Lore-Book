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

  it('restores the evidence manifest used by reloaded diagnostics', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-evidence',
      role: 'assistant',
      content: 'The interview was a major event this month.',
      created_at: '2026-08-12T12:00:00.000Z',
      metadata: {
        sources: [{ type: 'event', id: 'event-1', title: 'Interview completed' }],
        citations: [{ text: 'Interview completed', sourceId: 'event-1', sourceType: 'event' }],
        recall_sources: [{ entry_id: 'event-1', timestamp: '2026-08-08T12:00:00.000Z' }],
        ragStats: { sourceCount: 1, cacheHit: false, retrievalMs: 18, contextItems: 1 },
        response_mode: 'MEMORY_RECALL',
      },
    });

    expect(message.sources).toHaveLength(1);
    expect(message.citations).toHaveLength(1);
    expect(message.recall_sources).toHaveLength(1);
    expect(message.ragStats).toMatchObject({ sourceCount: 1, contextItems: 1 });
    expect(message.response_mode).toBe('MEMORY_RECALL');
  });

  it('synthesizes a failed lifecycle for an assistant row interrupted before any tokens arrived', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-failed',
      role: 'assistant',
      content: 'Response interrupted before it started.',
      created_at: '2026-08-12T12:00:00.000Z',
      metadata: { saved_from_stream: true, stream_status: 'failed' },
    });

    expect(message.lifecycle).toMatchObject({
      cloudPersistence: 'saved',
      processing: 'failed',
    });
    expect(message.lifecycle?.lastError).toMatchObject({
      stage: 'generation',
      retryable: true,
    });
  });

  it('does not synthesize a lifecycle for a normal completed assistant row', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-ok',
      role: 'assistant',
      content: 'All good.',
      created_at: '2026-08-12T12:00:00.000Z',
      metadata: { saved_from_stream: true, stream_status: 'complete' },
    });

    expect(message.lifecycle).toBeUndefined();
  });

  it('does not synthesize a lifecycle for a user row even if stream_status is failed', () => {
    const message = mapDbMessageRow({
      id: 'user-db-failed',
      role: 'user',
      content: 'hi',
      created_at: '2026-08-12T12:00:00.000Z',
      metadata: { stream_status: 'failed' },
    });

    expect(message.lifecycle).toBeUndefined();
  });

  it('synthesizes a failed lifecycle for an assistant row orphaned at stream_status:streaming past the stale threshold', () => {
    // e.g. the backend process died mid-request (OOM kill) before
    // finalizeAssistantMessage ever ran to flip the status.
    const staleCreatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const message = mapDbMessageRow({
      id: 'asst-db-orphaned',
      role: 'assistant',
      content: '',
      created_at: staleCreatedAt,
      metadata: { saved_from_stream: true, stream_status: 'streaming' },
    });

    expect(message.lifecycle).toMatchObject({
      cloudPersistence: 'saved',
      processing: 'failed',
    });
    expect(message.lifecycle?.lastError).toMatchObject({
      stage: 'generation',
      message: 'Response interrupted before it started.',
      retryable: true,
    });
  });

  it('does not synthesize a lifecycle for a recent assistant row still at stream_status:streaming', () => {
    // A genuinely in-flight stream (e.g. viewed from a second tab) should not
    // flash a false "failed" state within its normal generation window.
    const recentCreatedAt = new Date(Date.now() - 5000).toISOString();
    const message = mapDbMessageRow({
      id: 'asst-db-live',
      role: 'assistant',
      content: '',
      created_at: recentCreatedAt,
      metadata: { saved_from_stream: true, stream_status: 'streaming' },
    });

    expect(message.lifecycle).toBeUndefined();
  });

  it('does not synthesize a lifecycle for a streaming row with no created_at (cannot judge staleness)', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-no-timestamp',
      role: 'assistant',
      content: '',
      created_at: null,
      metadata: { saved_from_stream: true, stream_status: 'streaming' },
    });

    expect(message.lifecycle).toBeUndefined();
  });
});
