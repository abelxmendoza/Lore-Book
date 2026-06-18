/**
 * Safety invariant tests for the LoreBook agent layer.
 *
 *   1. Agents (services/agents/agents/*.ts) must not import the Supabase client
 *      or reference supabaseAdmin — they may only act through tools.
 *   2. The tool surface must only ever WRITE to lore_agent_* audit tables.
 *      It must never write (insert/update/delete/upsert) to core memory,
 *      entity, or identity tables.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const agentsDir = resolve(__dirname, '../../../src/services/agents');
const agentImplDir = resolve(agentsDir, 'agents');

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('agent layer: no direct DB access from agents', () => {
  it('no agent implementation imports the supabase client', () => {
    const files = readdirSync(agentImplDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const src = readSource(resolve(agentImplDir, file));
      expect(src, `${file} must not import supabaseClient`).not.toMatch(/from\s+['"].*supabaseClient['"]/);
      expect(src, `${file} must not reference supabaseAdmin`).not.toContain('supabaseAdmin');
    }
  });
});

// ─── Behavioral guarantee: tools only write to the audit table ─────────────────

const mutatingCalls: Array<{ table: string; method: string }> = [];

function trackingChain(table: string) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'in', 'order', 'ilike', 'limit'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  for (const m of ['insert', 'update', 'delete', 'upsert']) {
    builder[m] = vi.fn(async () => {
      mutatingCalls.push({ table, method: m });
      return { data: null, error: null };
    });
  }
  builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  builder.single = vi.fn(async () => ({ data: null, error: null }));
  return builder;
}

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (table: string) => trackingChain(table) },
}));

import { loreAgentTools } from '../../../src/services/agents/loreAgentTools';

describe('agent tools: writes are confined to the audit table', () => {
  beforeEach(() => {
    mutatingCalls.length = 0;
  });

  it('proposeMemoryMutation writes only to lore_agent_proposed_actions', async () => {
    await loreAgentTools.proposeMemoryMutation({
      userId: 'user-1',
      runId: 'run-1',
      agentName: 'MemoryAgent',
      claim: 'User plays the cello',
      category: 'skill',
      confidence: 0.9,
      provenance: [],
      routeTo: 'memory_review_queue',
    });

    expect(mutatingCalls.length).toBeGreaterThan(0);
    for (const call of mutatingCalls) {
      expect(call.table).toBe('lore_agent_proposed_actions');
    }
  });

  it('read tools never invoke a mutating method on any table', async () => {
    await loreAgentTools.searchMemories('user-1', 'cello');
    await loreAgentTools.getEntityGraph('user-1');
    await loreAgentTools.getRecentThreadContext('thread-1');
    await loreAgentTools.getPipelineTrace('user-1', 'msg-1');
    await loreAgentTools.getSystemKnowledge('memory');

    expect(mutatingCalls).toHaveLength(0);
  });
});
