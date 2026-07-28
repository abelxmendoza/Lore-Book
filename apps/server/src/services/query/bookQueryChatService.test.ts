import type { UniversalBookQueryResponse } from '@lorebook/api-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
}));

vi.mock('../../cognition/query/QueryEngine', () => ({
  queryEngine: {
    run: runMock,
  },
}));

import { answerBookQueryForUser } from './bookQueryChatService';

function response(overrides: Partial<UniversalBookQueryResponse> = {}): UniversalBookQueryResponse {
  const skill = {
    id: 'skill-1',
    domain: 'skill' as const,
    title: 'TypeScript',
    status: 'active',
    score: 90,
    matchedReasons: ['Used by MemoVault'],
    evidence: [{
      sourceTable: 'skills',
      sourceId: 'skill-1',
      label: 'Grounded skill record',
    }],
    relatedEntities: [{
      domain: 'project' as const,
      id: 'project-1',
      name: 'MemoVault',
      relation: 'used by project',
    }],
  };
  return {
    query: 'What skills support my active quests?',
    intent: 'cross_book',
    results: [skill],
    connections: [{
      fromId: 'skill-1',
      toId: 'project-1',
      relation: 'used by project',
      reason: 'TypeScript is connected to MemoVault',
    }],
    groups: [{ domain: 'skill', count: 1, results: [skill] }],
    total: 1,
    facets: {
      domains: [{ value: 'skill', count: 1 }],
      statuses: [{ value: 'active', count: 1 }],
    },
    warnings: [],
    diagnostics: {
      queriedDomains: ['skill', 'quest'],
      degradedDomains: [],
      elapsedMs: 12,
    },
    ...overrides,
  };
}

describe('Book query chat service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the Book executor and returns evidence-aware metadata', async () => {
    runMock.mockResolvedValue({
      classification: { intent: 'ATTRIBUTE' },
      resolvedEntities: [],
      merged: { confidence: 0.9, contributingSources: ['books'] },
      results: [{
        source: 'books',
        raw: response(),
        confidence: 0.9,
        records: [],
        citations: [],
        provenance: [],
        latencyMs: 12,
      }],
    });

    const result = await answerBookQueryForUser(
      'synthetic-user',
      'What skills support my active quests?',
    );

    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'synthetic-user',
      message: 'What skills support my active quests?',
    }));
    expect(result.response_mode).toBe('BOOK_QUERY');
    expect(result.content).toContain('TypeScript');
    expect(result.content).toContain('1 grounded connection');
    expect(result.metadata).toMatchObject({
      executor: 'books',
      queriedBooks: ['skill', 'quest'],
      resultCount: 1,
    });
    expect(result.metadata.sources).toEqual([
      expect.objectContaining({ id: 'skill-1', sourceTable: 'skills' }),
    ]);
  });

  it('distinguishes a grounded empty result from total source failure', async () => {
    runMock
      .mockResolvedValueOnce({
        classification: { intent: 'ATTRIBUTE' },
        resolvedEntities: [],
        merged: { confidence: 0, contributingSources: ['books'] },
        results: [{
          source: 'books',
          raw: response({
            results: [],
            groups: [],
            connections: [],
            total: 0,
            facets: { domains: [], statuses: [] },
          }),
        }],
      })
      .mockResolvedValueOnce({
        classification: { intent: 'ATTRIBUTE' },
        resolvedEntities: [],
        merged: { confidence: 0, contributingSources: ['books'] },
        results: [{
          source: 'books',
          raw: response({
            results: [],
            groups: [],
            connections: [],
            total: 0,
            facets: { domains: [], statuses: [] },
            diagnostics: {
              queriedDomains: ['skill', 'quest'],
              degradedDomains: ['skill', 'quest'],
              elapsedMs: 8,
            },
          }),
        }],
      });

    const empty = await answerBookQueryForUser('synthetic-user', 'show skills and quests');
    const failed = await answerBookQueryForUser('synthetic-user', 'show skills and quests');

    expect(empty.response_mode).toBe('BOOK_QUERY_EMPTY');
    expect(empty.content).toContain('found no grounded records');
    expect(failed.response_mode).toBe('BOOK_QUERY_FAILED');
    expect(failed.content).toContain('No answer was invented');
  });

  it('renders canonical graph paths with their evidence in chat', async () => {
    runMock.mockResolvedValue({
      classification: { intent: 'GRAPH' },
      resolvedEntities: [
        { mention: 'Marcus', id: 'person-1', canonicalName: 'Marcus', method: 'exact', confidence: 1 },
      ],
      merged: { confidence: 0.86, contributingSources: ['books', 'graph'] },
      results: [
        {
          source: 'books',
          raw: response(),
          confidence: 0.8,
          citations: [],
        },
        {
          source: 'graph',
          confidence: 0.86,
          citations: [{ kind: 'entity', id: 'member-1', label: 'Membership' }],
          raw: {
            visited: 3,
            paths: [{
              nodes: [
                { id: 'person-1', type: 'character', name: 'Marcus' },
                { id: 'org-1', type: 'organization', name: 'Vanguard Robotics' },
              ],
              edges: [{
                fromId: 'person-1',
                toId: 'org-1',
                type: 'member',
                evidence: [{
                  sourceTable: 'organization_members',
                  sourceId: 'member-1',
                  label: 'Membership',
                }],
              }],
            }],
          },
        },
      ],
    });

    const result = await answerBookQueryForUser(
      'synthetic-user',
      'What is Marcus connected to?',
    );

    expect(result.response_mode).toBe('BOOK_QUERY');
    expect(result.content).toContain('Marcus —[member]→ Vanguard Robotics');
    expect(result.metadata).toMatchObject({
      executor: 'books+graph',
      connectionCount: 2,
      queryTrace: { intent: 'GRAPH' },
    });
  });
});
