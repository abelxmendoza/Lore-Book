/**
 * Live association ingestion — verifies the env gate, fail-open behavior, the
 * persistence round-trip, and that explicit membership survives end to end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upserted: Array<Record<string, unknown>> = [];
let loadedRows: Array<Record<string, unknown>> = [];

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: loadedRows, error: null })),
      })),
      upsert: vi.fn((rows: Array<Record<string, unknown>>) => {
        upserted.push(...rows);
        return Promise.resolve({ error: null });
      }),
    })),
  },
}));

vi.mock('../../../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/services/selfCharacterService', () => ({
  selfCharacterService: {
    ensureSelfCharacter: vi.fn().mockResolvedValue({ id: 'self-1', name: 'Abel' }),
  },
}));

// The analyzer returns a structured SemanticAnalysis for the message text.
vi.mock('../../../src/services/lorebook/semantic', () => ({
  analyzeSemanticsForUser: vi.fn(async (_userId: string, text: string, opts: { messageId?: string }) => ({
    userId: 'u1',
    text,
    messageId: opts?.messageId,
    entities: [],
    relationships: [
      {
        from: { entityId: 'self-1', domain: 'characters', name: 'Abel' },
        to: { entityId: 'org-vanguard', domain: 'organizations', name: 'Vanguard Robotics' },
        relationType: 'works_at',
        confidence: 0.95,
        gate: 'suggest',
        bothEndpointsResolved: true,
      },
    ],
    events: [],
    crossBook: [],
    ambiguities: [],
    reviewItems: [],
    suppressed: [],
    stances: [],
    temporal: [],
    contradictions: [],
    provenance: [],
    confidence: 0.9,
    warnings: [],
  })),
}));

// Book sinks the bridge routes into — mocked so we can assert end-to-end routing.
const upsertFromInference = vi.fn().mockResolvedValue(true);
const ingestExternalDetections = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/services/organizations/organizationSuggestionService', () => ({
  organizationSuggestionService: { upsertFromInference },
}));
vi.mock('../../../src/services/groupCandidateService', () => ({
  groupCandidateService: { ingestExternalDetections },
}));

import { associationIngestionService } from '../../../src/services/associations/associationIngestionService';

beforeEach(() => {
  upserted.length = 0;
  loadedRows = [];
  upsertFromInference.mockClear();
  ingestExternalDetections.mockClear();
  delete process.env.ASSOCIATION_GRAPH_ENABLED;
});

describe('associationIngestionService', () => {
  it('is disabled by default (env gate)', async () => {
    const result = await associationIngestionService.ingestMessage({ userId: 'u1', text: 'I work at Vanguard Robotics' });
    expect(result).toBeNull();
    expect(upserted).toHaveLength(0);
  });

  it('when enabled, persists an explicit member_of edge from the analyzer', async () => {
    process.env.ASSOCIATION_GRAPH_ENABLED = 'true';
    const result = await associationIngestionService.ingestMessage({
      userId: 'u1',
      text: 'I work at Vanguard Robotics',
      messageId: 'm1',
    });

    expect(result).not.toBeNull();
    const memberEdge = upserted.find((r) => r.association_type === 'member_of' && r.target_entity_id === 'org-vanguard');
    expect(memberEdge).toBeTruthy();
    expect(memberEdge?.source_entity_id).toBe('self-1');
    expect(Number(memberEdge?.confidence)).toBeGreaterThanOrEqual(0.9);
  });

  it('end-to-end: a membership message routes through to an organization suggestion', async () => {
    process.env.ASSOCIATION_GRAPH_ENABLED = 'true';
    await associationIngestionService.ingestMessage({
      userId: 'u1',
      text: 'I work at Vanguard Robotics',
      messageId: 'm1',
    });

    // analyze → graph → persist → bridge → Orgs book suggestion.
    expect(upsertFromInference).toHaveBeenCalledTimes(1);
    const [, candidate] = upsertFromInference.mock.calls[0];
    expect(candidate.displayName).toBe('Vanguard Robotics');
    expect(candidate.organizationType).toBe('employer');
  });

  it('is fail-open when text is too short', async () => {
    process.env.ASSOCIATION_GRAPH_ENABLED = 'true';
    const result = await associationIngestionService.ingestMessage({ userId: 'u1', text: 'hi' });
    expect(result).toBeNull();
    expect(upserted).toHaveLength(0);
  });
});
