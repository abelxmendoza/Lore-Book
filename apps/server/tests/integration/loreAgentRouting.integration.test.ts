/**
 * Integration-style tests for LoreAgent proposal routing error paths.
 * Uses the same mock DB harness as unit tests but exercises multi-agent batches.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoreAgentProposedAction, LoreAgentResult } from '../../src/services/agents/loreAgentTypes';

const state = {
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  entityAuthorityError: null as { code?: string; message?: string } | null,
  selfEntityId: 'self-1' as string | null,
};

function thenableQuery(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.eq = vi.fn(() => builder);
  builder.then = (resolve: (v: unknown) => void) => resolve(result);
  return builder;
}

function chain(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ['order']) builder[m] = vi.fn(() => builder);

  builder.insert = vi.fn((row: Record<string, unknown>) => {
    state.inserts.push({ table, row });
    return builder;
  });

  builder.single = vi.fn(async () => {
    if (table === 'entity_authority_decisions' && state.entityAuthorityError) {
      return { data: null, error: state.entityAuthorityError };
    }
    return { data: { id: `${table}-new` }, error: null };
  });

  builder.select = vi.fn((cols?: string) => {
    if (table === 'lore_agent_proposed_actions' && cols?.includes('payload')) {
      return thenableQuery({
        data: [{ id: 'pa-1', payload: {} }],
        error: null,
      });
    }
    return builder;
  });

  builder.update = vi.fn((patch: Record<string, unknown>) => ({
    eq: vi.fn(async (idCol: string, id: unknown) => {
      state.inserts.push({ table: `${table}:update`, row: { idCol, id, patch } });
      return { data: null, error: null };
    }),
  }));

  return builder;
}

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (table: string) => chain(table) },
}));

vi.mock('../../src/services/selfCharacterService', () => ({
  selfCharacterService: {
    ensureSelfCharacter: vi.fn(async () => ({ id: state.selfEntityId })),
  },
}));

import { routeAgentResults } from '../../src/services/agents/loreAgentProposalRouter';

function result(agent: string, actions: LoreAgentProposedAction[]): LoreAgentResult {
  return {
    agentName: agent,
    runId: 'run-batch',
    observations: [],
    proposedActions: actions,
    confidence: 0.8,
    evidence: [],
    warnings: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

describe('lore agent routing integration', () => {
  beforeEach(() => {
    state.inserts = [];
    state.entityAuthorityError = null;
    state.selfEntityId = 'self-1';
  });

  it('routes a mixed batch from multiple agents', async () => {
    const routed = await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-batch',
      results: [
        result('MemoryAgent', [
          {
            type: 'propose_memory_mutation',
            label: 'skill',
            payload: { claim: 'cello', category: 'skill' },
            confidence: 0.9,
            requiresConfirmation: true,
            routeTo: 'memory_review_queue',
          },
        ]),
        result('IdentityAgent', [
          {
            type: 'propose_identity_review',
            label: 'collision',
            payload: { name: 'Jordan' },
            confidence: 0.7,
            requiresConfirmation: true,
            routeTo: 'entity_authority',
          },
        ]),
        result('ContradictionAgent', [
          {
            type: 'propose_correction',
            label: 'fix location',
            payload: { field: 'city' },
            confidence: 0.85,
            requiresConfirmation: true,
            routeTo: 'correction_authority',
          },
        ]),
      ],
    });

    expect(routed.filter((r) => r.ok)).toHaveLength(3);
    expect(state.inserts.some((i) => i.table === 'memory_proposals')).toBe(true);
    expect(state.inserts.some((i) => i.table === 'entity_authority_decisions')).toBe(true);
  });

  it('continues routing other agents when entity authority insert fails', async () => {
    state.entityAuthorityError = { message: 'constraint violation' };

    const routed = await routeAgentResults({
      userId: 'user-1',
      messageId: 'msg-1',
      runId: 'run-batch',
      results: [
        result('MemoryAgent', [
          {
            type: 'propose_memory_mutation',
            label: 'fact',
            payload: { claim: 'fact', category: 'general' },
            confidence: 0.8,
            requiresConfirmation: true,
            routeTo: 'memory_review_queue',
          },
        ]),
        result('IdentityAgent', [
          {
            type: 'propose_alias',
            label: 'alias',
            payload: { name: 'Sam' },
            confidence: 0.75,
            requiresConfirmation: true,
            routeTo: 'entity_authority',
          },
        ]),
      ],
    });

    expect(routed).toHaveLength(2);
    expect(routed.find((r) => r.routeTo === 'memory_review_queue')?.ok).toBe(true);
    expect(routed.find((r) => r.routeTo === 'entity_authority')?.ok).toBe(false);
  });
});
