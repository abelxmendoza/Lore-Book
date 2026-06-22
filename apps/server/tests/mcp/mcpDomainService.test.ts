import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpAuthContext } from '../../src/mcp/types';

const mockRetrieve = vi.fn();
const mockSearchEntities = vi.fn();
const mockListCertified = vi.fn();
const mockGetTimeline = vi.fn();
const mockGetEntityRelationships = vi.fn();
const mockAudit = vi.fn();

vi.mock('../../src/services/chat/memoryRetriever', () => ({
  MemoryRetriever: class {
    retrieve = (...args: unknown[]) => mockRetrieve(...args);
  },
}));

vi.mock('../../src/services/search/entitySearchService', () => ({
  searchEntities: (...args: unknown[]) => mockSearchEntities(...args),
}));

vi.mock('../../src/services/entities/certifiedEntityIndexService', () => ({
  listCertifiedEntities: (...args: unknown[]) => mockListCertified(...args),
}));

vi.mock('../../src/services/timeline/timelineEngine', () => ({
  TimelineEngine: class {
    getTimeline = (...args: unknown[]) => mockGetTimeline(...args);
  },
}));

vi.mock('../../src/services/conversationCentered/entityRelationshipDetector', () => ({
  entityRelationshipDetector: {
    getEntityRelationships: (...args: unknown[]) => mockGetEntityRelationships(...args),
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
          maybeSingle: async () => ({ data: null }),
          or: () => ({ limit: async () => ({ data: [] }) }),
        }),
        gte: () => ({
          lte: () => ({
            order: () => ({ limit: async () => ({ data: [] }) }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('../../src/mcp/mcpAuditService', () => ({
  auditMcpToolCall: (...args: unknown[]) => mockAudit(...args),
}));

import { mcpSearchMemories, mcpSearchEntities } from '../../src/mcp/mcpDomainService';

const ctx: McpAuthContext = {
  user: { id: 'user-1', email: 'a@b.com' },
  clientId: 'test-client',
  requestId: 'req-1',
  scopes: ['memory:read'],
};

describe('mcpDomainService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('search_memories returns ranked entries with provenance', async () => {
    mockRetrieve.mockResolvedValue({
      entries: [
        {
          id: 'mem-1',
          user_id: 'user-1',
          date: '2026-06-01',
          content: 'Met Alice at the park',
          tags: [],
          source: 'manual',
        },
      ],
    });

    const result = await mcpSearchMemories(ctx, { query: 'Alice park' });
    expect(result.ok).toBe(true);
    expect(result.data.count).toBe(1);
    expect(result.provenance.sources[0]?.artifact_id).toBe('mem-1');
    expect(mockRetrieve).toHaveBeenCalledWith('user-1', 10, 'Alice park');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'search_memories', status: 'ok' })
    );
  });

  it('search_entities maps entity search results', async () => {
    mockSearchEntities.mockResolvedValue({
      query: 'Alice',
      results: [
        {
          entityId: 'char-1',
          entityType: 'person',
          displayName: 'Alice',
          aliases: [],
          knownStatus: 'known',
          confidence: 0.95,
          source: 'characters',
        },
      ],
    });

    const result = await mcpSearchEntities(ctx, { query: 'Alice' });
    expect(result.data.count).toBe(1);
    expect(result.data.entities[0]?.displayName).toBe('Alice');
    expect(result.provenance.sources[0]?.artifact_id).toBe('char-1');
  });
});
