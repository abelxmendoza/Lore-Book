import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAudit = vi.fn(async () => undefined);
const mockGetUser = vi.fn();

vi.mock('../../src/mcp/mcpAuditService', () => ({
  auditMcpToolCall: (...args: unknown[]) => mockAudit(...args),
}));

vi.mock('../../src/mcp/mcpDomainService', () => ({
  mcpSearchMemories: vi.fn(async () => ({ ok: true, data: [] })),
  mcpSearchEntities: vi.fn(async () => ({ ok: true, data: [] })),
  mcpGetEntity: vi.fn(async () => ({ ok: true, data: null })),
  mcpGetTimeline: vi.fn(async () => ({ ok: true, data: [] })),
  mcpGetRelationships: vi.fn(async () => ({ ok: true, data: [] })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  }),
}));

vi.mock('../../src/config', () => ({
  config: {
    supabaseUrl: 'https://example.supabase.co',
    supabaseServiceRoleKey: 'service-key',
  },
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { mcpAuthMiddleware } from '../../src/mcp/mcpAuth';
import { mcpCorrectLore } from '../../src/mcp/mcpLoreCorrect';
import { mcpIngestStory } from '../../src/mcp/mcpLoreIngest';
import { createMcpServerForUser } from '../../src/mcp/mcpServerFactory';
import type { McpAuthContext } from '../../src/mcp/types';

function ctxWithScopes(scopes: string[]): McpAuthContext {
  return {
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'test@example.com',
      lastSignInAt: '2026-01-01T00:00:00Z',
      fullName: 'Test User',
    },
    clientId: 'scope-test',
    requestId: 'req-scope-test',
    scopes,
  };
}

async function listToolNames(ctx: McpAuthContext): Promise<string[]> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServerForUser(ctx);
  const client = new Client({ name: 'scope-test-client', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => t.name).sort();
  } finally {
    await client.close();
    await server.close();
  }
}

const READ_TOOLS = ['get_entity', 'get_relationships', 'get_timeline', 'search_entities', 'search_memories'];

describe('MCP scope enforcement — tool registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a memory:read-only context sees exactly the 5 read tools', async () => {
    await expect(listToolNames(ctxWithScopes(['memory:read']))).resolves.toEqual(READ_TOOLS);
  });

  it('memory:write alone unlocks ingest_story but not correct_lore', async () => {
    await expect(listToolNames(ctxWithScopes(['memory:read', 'memory:write']))).resolves.toEqual(
      [...READ_TOOLS, 'ingest_story'].sort()
    );
  });

  it('memory:write + entity:write unlocks both write tools', async () => {
    await expect(
      listToolNames(ctxWithScopes(['memory:read', 'memory:write', 'entity:write']))
    ).resolves.toEqual([...READ_TOOLS, 'correct_lore', 'ingest_story'].sort());
  });
});

describe('MCP scope enforcement — handler defenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ingest_story denies a read-only context and audits the denial', async () => {
    const result = await mcpIngestStory(ctxWithScopes(['memory:read']), {
      story:
        'I went to dinner with my friend Marcus last night and we talked about my grandmother for hours. I felt grateful the whole evening.',
      source_tool: 'scope-test',
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('insufficient_scope');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'ingest_story', status: 'denied', errorCode: 'insufficient_scope' })
    );
  });

  it('ingest_story with memory:write passes the scope gate (narrative guard decides next)', async () => {
    const result = await mcpIngestStory(ctxWithScopes(['memory:read', 'memory:write']), {
      story: 'I saw her.',
      source_tool: 'scope-test',
    });
    expect(result.reason).toBe('too_short');
  });

  it('correct_lore denies a read-only context and audits the denial', async () => {
    const result = await mcpCorrectLore(ctxWithScopes(['memory:read']), {
      action: 'rename_character',
      character_id: '22222222-2222-2222-2222-222222222222',
      new_name: 'Jamie',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('memory:write');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'correct_lore', status: 'denied', errorCode: 'insufficient_scope' })
    );
  });

  it('correct_lore requires entity:write in addition to memory:write', async () => {
    const result = await mcpCorrectLore(ctxWithScopes(['memory:read', 'memory:write']), {
      action: 'rename_character',
      character_id: '22222222-2222-2222-2222-222222222222',
      new_name: 'Jamie',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('entity:write');
  });
});

describe('MCP scope enforcement — session-token auth path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_AUTH_FOR_DEV;
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'a@b.com',
          last_sign_in_at: '2026-01-01T00:00:00Z',
          user_metadata: { full_name: 'Test User' },
        },
      },
      error: null,
    });
  });

  it('ignores caller-supplied x-mcp-scopes and x-mcp-client-id headers', async () => {
    const req = {
      headers: {
        authorization: 'Bearer good-token',
        'x-mcp-scopes': 'memory:write entity:write',
        'x-mcp-client-id': 'spoofed-client',
      },
      ip: '127.0.0.1',
      requestId: 'req-1',
    } as unknown as Parameters<typeof mcpAuthMiddleware>[0] & { mcpContext?: McpAuthContext };
    const res = {
      status: vi.fn(function (this: unknown) {
        return this;
      }),
      json: vi.fn(function (this: unknown) {
        return this;
      }),
    } as unknown as Parameters<typeof mcpAuthMiddleware>[1];
    const next = vi.fn();

    await mcpAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.mcpContext?.scopes).toEqual(['memory:read']);
    expect(req.mcpContext?.clientId).toBe('lorebook-session');
  });
});
