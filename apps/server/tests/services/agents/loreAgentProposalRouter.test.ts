import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoreAgentProposedAction, LoreAgentResult } from '../../../src/services/agents/loreAgentTypes';

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<{ table: string; id: unknown; patch: Record<string, unknown> }> = [];
let proposedActionRows: Array<Record<string, unknown>> = [];
let insertErrors: Record<string, { code?: string; message?: string } | null> = {};
let selfEntityId: string | null = 'self-entity-1';

function thenableQuery(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.eq = vi.fn(() => builder);
  builder.then = (resolve: (v: unknown) => void) => resolve(result);
  return builder;
}

function chain(table: string) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['order'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);

  builder.single = vi.fn(async () => {
    const err = insertErrors[table] ?? null;
    if (err) return { data: null, error: err };
    const last = inserts.filter((i) => i.table === table).at(-1);
    return { data: { id: `${table}-id-1`, ...(last?.row ?? {}) }, error: null };
  });

  builder.insert = vi.fn((row: Record<string, unknown>) => {
    inserts.push({ table, row });
    return builder;
  });

  builder.update = vi.fn((patch: Record<string, unknown>) => {
    const updateChain = {
      eq: vi.fn((_col: string, id: unknown) => {
        updates.push({ table, id, patch });
        return Promise.resolve({ data: null, error: null });
      }),
    };
    return updateChain;
  });

  builder.select = vi.fn((cols?: string) => {
    if (table === 'lore_agent_proposed_actions' && cols?.includes('payload')) {
      return thenableQuery({ data: proposedActionRows, error: null });
    }
    return builder;
  });

  return builder;
}

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (table: string) => chain(table) },
}));

vi.mock('../../../src/services/selfCharacterService', () => ({
  selfCharacterService: {
    ensureSelfCharacter: vi.fn(async () => ({ id: selfEntityId })),
  },
}));

import { routeAgentResults } from '../../../src/services/agents/loreAgentProposalRouter';

function makeAction(overrides: Partial<LoreAgentProposedAction> = {}): LoreAgentProposedAction {
  return {
    type: 'propose_memory_mutation',
    label: 'Remember cello skill',
    payload: { claim: 'User plays cello', category: 'skill', source: 'msg-1' },
    confidence: 0.9,
    requiresConfirmation: true,
    routeTo: 'memory_review_queue',
    ...overrides,
  };
}

function makeResult(
  agentName: string,
  actions: LoreAgentProposedAction[],
  overrides: Partial<LoreAgentResult> = {}
): LoreAgentResult {
  return {
    agentName,
    runId: 'run-1',
    observations: [],
    proposedActions: actions,
    confidence: 0.9,
    evidence: [],
    warnings: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('routeAgentResults', () => {
  beforeEach(() => {
    inserts.length = 0;
    updates.length = 0;
    proposedActionRows = [{ id: 'pa-1', payload: {} }];
    insertErrors = {};
    selfEntityId = 'self-entity-1';
  });

  it('routes memory proposals to memory_proposals with PENDING status', async () => {
    const results = await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-1',
      results: [makeResult('MemoryAgent', [makeAction()])],
    });

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].routeTo).toBe('memory_review_queue');

    const mrqInsert = inserts.find((i) => i.table === 'memory_proposals');
    expect(mrqInsert?.row.status).toBe('PENDING');
    expect(mrqInsert?.row.entity_id).toBe('self-entity-1');
    expect(mrqInsert?.row.metadata).toMatchObject({ lore_agent_run_id: 'run-1' });
  });

  it('routes entity authority proposals to entity_authority_decisions', async () => {
    const results = await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-1',
      results: [
        makeResult('IdentityAgent', [
          makeAction({
            type: 'propose_alias',
            routeTo: 'entity_authority',
            payload: { name: 'Alex', characterId: 'char-1' },
          }),
        ]),
      ],
    });

    expect(results[0].ok).toBe(true);
    const eaInsert = inserts.find((i) => i.table === 'entity_authority_decisions');
    expect(eaInsert?.row.applied).toBe(false);
    expect(eaInsert?.row.status).toBe('pending');
  });

  it('marks correction proposals as routed without writing truth state', async () => {
    const results = await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-1',
      results: [
        makeResult('ContradictionAgent', [
          makeAction({
            type: 'propose_correction',
            routeTo: 'correction_authority',
            payload: { field: 'location', newClaim: 'Austin' },
          }),
        ]),
      ],
    });

    expect(results[0].ok).toBe(true);
    expect(inserts.some((i) => i.table === 'memory_proposals')).toBe(false);
    expect(
      inserts.some((i) => i.table === 'lore_agent_proposed_actions:update') ||
        updates.some((u) => u.table === 'lore_agent_proposed_actions')
    ).toBe(true);
  });

  it('skips actions without requiresConfirmation', async () => {
    const results = await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-1',
      results: [
        makeResult('MemoryAgent', [makeAction({ requiresConfirmation: false })]),
      ],
    });

    expect(results).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('deduplicates identical actions within one pass', async () => {
    const action = makeAction();
    await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-1',
      results: [
        makeResult('MemoryAgent', [action, action]),
      ],
    });

    const mrqInserts = inserts.filter((i) => i.table === 'memory_proposals');
    expect(mrqInserts).toHaveLength(1);
  });

  it('handles missing self entity gracefully', async () => {
    selfEntityId = null;

    const results = await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-1',
      results: [makeResult('MemoryAgent', [makeAction()])],
    });

    expect(results[0].ok).toBe(false);
    expect(results[0].error).toContain('self entity');
    expect(inserts.filter((i) => i.table === 'memory_proposals')).toHaveLength(0);
  });

  it('handles missing memory_proposals table without throwing', async () => {
    insertErrors.memory_proposals = { code: 'PGRST205', message: 'table missing' };

    const results = await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-1',
      results: [makeResult('MemoryAgent', [makeAction()])],
    });

    expect(results[0].ok).toBe(false);
    expect(results[0].error).toContain('missing');
  });

  it('ignores routeTo none actions', async () => {
    const results = await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-1',
      results: [
        makeResult('NarrativeAgent', [
          makeAction({ routeTo: 'none', type: 'propose_narrative_update' }),
        ]),
      ],
    });

    expect(results).toHaveLength(0);
  });
});
