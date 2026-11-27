import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAudit = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
const svc = vi.hoisted(() => ({
  listCheckpoints: vi.fn(async () => [
    { id: 'c1', project: 'Lore-Book', agent: 'claude_code', where_left_off: 'Wired MCP', next_steps: [], updated_at: '2026-11-27T00:00:00Z' },
    { id: 'c2', project: 'Other', agent: 'codex', where_left_off: 'Tests', next_steps: [], updated_at: '2026-11-26T00:00:00Z' },
  ]),
  listMemories: vi.fn(async () => []),
  listMilestones: vi.fn(async () => []),
  upsertCheckpoint: vi.fn(async (_u: string, a: Record<string, unknown>) => ({ id: 'c9', ...a })),
  upsertMemory: vi.fn(async (_u: string, a: Record<string, unknown>) => ({ id: 'm9', ...a })),
  addMilestone: vi.fn(async (_u: string, a: Record<string, unknown>) => ({ id: 'ms9', ...a })),
}));

vi.mock('../../src/mcp/mcpAuditService', () => ({
  auditMcpToolCall: (...args: unknown[]) => mockAudit(...args),
}));
vi.mock('../../src/services/hivemind/hivemindService', () => svc);
vi.mock('../../src/mcp/mcpDomainService', () => ({
  mcpSearchMemories: vi.fn(),
  mcpSearchEntities: vi.fn(),
  mcpGetEntity: vi.fn(),
  mcpGetTimeline: vi.fn(),
  mcpGetRelationships: vi.fn(),
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { containsLikelySecret, runHivemindTool } from '../../src/mcp/mcpHivemind';
import { createMcpServerForUser } from '../../src/mcp/mcpServerFactory';
import type { McpAuthContext } from '../../src/mcp/types';

function ctx(scopes: string[], hivemind: boolean | undefined): McpAuthContext {
  return {
    user: { id: '11111111-1111-1111-1111-111111111111' },
    clientId: 'hivemind-test',
    requestId: 'req-hivemind',
    scopes,
    features: hivemind === undefined ? undefined : { hivemind },
  };
}

async function toolNames(c: McpAuthContext): Promise<string[]> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServerForUser(c);
  const client = new Client({ name: 't', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return (await client.listTools()).tools.map((t) => t.name).filter((n) => n.startsWith('hivemind_')).sort();
  } finally {
    await client.close();
    await server.close();
  }
}

const HIVEMIND_READ = ['hivemind_milestones', 'hivemind_recall', 'hivemind_where_i_left_off'];
const HIVEMIND_ALL = [...HIVEMIND_READ, 'hivemind_checkpoint', 'hivemind_log_milestone', 'hivemind_record_memory'].sort();

describe('Hivemind MCP tool registration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('no Hivemind tools for an account without the feature, even with scopes', async () => {
    await expect(toolNames(ctx(['memory:read', 'hivemind:read', 'hivemind:write'], false))).resolves.toEqual([]);
    await expect(toolNames(ctx(['memory:read', 'hivemind:read', 'hivemind:write'], undefined))).resolves.toEqual([]);
  });

  it('no Hivemind tools for an enabled account whose token lacks hivemind scopes', async () => {
    await expect(toolNames(ctx(['memory:read', 'memory:write'], true))).resolves.toEqual([]);
  });

  it('hivemind:read unlocks read tools only', async () => {
    await expect(toolNames(ctx(['memory:read', 'hivemind:read'], true))).resolves.toEqual(HIVEMIND_READ);
  });

  it('hivemind:read + hivemind:write unlocks all six tools', async () => {
    await expect(toolNames(ctx(['memory:read', 'hivemind:read', 'hivemind:write'], true))).resolves.toEqual(HIVEMIND_ALL);
  });
});

describe('Hivemind MCP handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('denies (and audits) a direct call when the account lacks the feature', async () => {
    const res = (await runHivemindTool(ctx(['hivemind:write'], false), 'hivemind_checkpoint', {
      project: 'p', agent: 'a', where_left_off: 'x',
    })) as { ok: boolean; reason: string };
    expect(res).toMatchObject({ ok: false, reason: 'hivemind_not_enabled' });
    expect(svc.upsertCheckpoint).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied', errorCode: 'hivemind_not_enabled' }));
  });

  it('denies a write with only hivemind:read', async () => {
    const res = await runHivemindTool(ctx(['hivemind:read'], true), 'hivemind_record_memory', { title: 't', content: 'c' });
    expect(res).toMatchObject({ ok: false, reason: 'insufficient_scope' });
    expect(svc.upsertMemory).not.toHaveBeenCalled();
  });

  it('writes a checkpoint for the token user', async () => {
    const res = await runHivemindTool(ctx(['hivemind:write'], true), 'hivemind_checkpoint', {
      project: 'Lore-Book', agent: 'claude_code', where_left_off: 'Shipped Hivemind', next_steps: ['Open PR'],
    });
    expect(res).toMatchObject({ ok: true });
    expect(svc.upsertCheckpoint).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', expect.objectContaining({ project: 'Lore-Book' }));
  });

  it('filters where_i_left_off by project, case-insensitively', async () => {
    const res = (await runHivemindTool(ctx(['hivemind:read'], true), 'hivemind_where_i_left_off', { project: 'lore-book' })) as { data: Array<{ id: string }> };
    expect(res.data.map((r) => r.id)).toEqual(['c1']);
  });

  it('refuses to store something that looks like a secret', async () => {
    const res = await runHivemindTool(ctx(['hivemind:write'], true), 'hivemind_record_memory', {
      title: 'OpenAI key', content: 'use sk-proj-abcdefghijklmnopqrstuvwxyz123456',
    });
    expect(res).toMatchObject({ ok: false, reason: 'secret_detected' });
    expect(svc.upsertMemory).not.toHaveBeenCalled();
  });

  it('audit input never includes memory text', async () => {
    await runHivemindTool(ctx(['hivemind:write'], true), 'hivemind_record_memory', { title: 'Convention', content: 'private detail' });
    const call = mockAudit.mock.calls.at(-1)?.[0] as { input: unknown };
    expect(JSON.stringify(call.input)).not.toContain('private detail');
  });
});

describe('containsLikelySecret', () => {
  it('flags common token shapes and private keys', () => {
    expect(containsLikelySecret('ghp_abcdefghijklmnopqrstuvwxyz1234')).toBe(true);
    expect(containsLikelySecret('-----BEGIN OPENSSH PRIVATE KEY-----')).toBe(true);
    expect(containsLikelySecret('AKIAABCDEFGHIJKLMNOP')).toBe(true);
  });
  it('allows ordinary notes', () => {
    expect(containsLikelySecret('Use npm install --legacy-peer-deps in apps/web')).toBe(false);
  });
});
