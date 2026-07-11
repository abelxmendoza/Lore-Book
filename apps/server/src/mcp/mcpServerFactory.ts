import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  mcpGetEntity,
  mcpGetRelationships,
  mcpGetTimeline,
  mcpSearchEntities,
  mcpSearchMemories,
} from './mcpDomainService';
import { correctLoreInputSchema, mcpCorrectLore } from './mcpLoreCorrect';
import { ingestStoryInputSchema, mcpIngestStory } from './mcpLoreIngest';
import type { McpAuthContext } from './types';
import { MCP_SERVER_INSTRUCTIONS } from './types';

function jsonText(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export function createMcpServerForUser(ctx: McpAuthContext): McpServer {
  const server = new McpServer(
    { name: 'lorebook-memory', version: '1.0.0' },
    {
      instructions: MCP_SERVER_INSTRUCTIONS,
      capabilities: { tools: {} },
    }
  );

  server.registerTool(
    'search_memories',
    {
      description:
        'Semantic search over the user journal and memory graph. Call before asserting autobiographical facts.',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(30).optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        _version: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (args) => jsonText(await mcpSearchMemories(ctx, args))
  );

  server.registerTool(
    'search_entities',
    {
      description: 'Search certified characters, places, organizations, skills, and events by name or alias.',
      inputSchema: {
        query: z.string().min(1),
        types: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(40).optional(),
        _version: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (args) => jsonText(await mcpSearchEntities(ctx, args))
  );

  server.registerTool(
    'get_entity',
    {
      description: 'Fetch a single entity card by UUID (character, omega entity, or certified book entity).',
      inputSchema: {
        id: z.string().min(1),
        _version: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (args) => jsonText(await mcpGetEntity(ctx, args))
  );

  server.registerTool(
    'get_timeline',
    {
      description: 'Ordered timeline events between start_date and end_date (ISO dates). Optional entity_id filter.',
      inputSchema: {
        start_date: z.string().min(1),
        end_date: z.string().min(1),
        entity_id: z.string().optional(),
        _version: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (args) => jsonText(await mcpGetTimeline(ctx, args))
  );

  server.registerTool(
    'get_relationships',
    {
      description: 'Typed relationship edges for an entity (character or omega entity).',
      inputSchema: {
        entity_id: z.string().min(1),
        direction: z.enum(['outbound', 'inbound', 'both']).optional(),
        _version: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (args) => jsonText(await mcpGetRelationships(ctx, args))
  );

  server.registerTool(
    'ingest_story',
    {
      description:
        "Store a piece of the user's life story into LoreBook's memory. Use when the user shares autobiographical narrative during a development session (people, events, places, relationships). Send ONLY the story text — never code, specs, or technical discussion. LoreBook extracts entities, deduplicates against known lore, and records provenance.",
      inputSchema: ingestStoryInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => jsonText(await mcpIngestStory(ctx, args))
  );

  server.registerTool(
    'correct_lore',
    {
      description:
        "Apply the user's explicit correction to their lore: rename a character (rename_character: character_id + new_name), fix a romantic classification (set_romantic_classification: relationship_id + relationship_type/status), remove a wrong Dating & Romance card (exclude_from_dating: relationship_id), or confirm a real one (confirm_romantic: relationship_id). Only use when the user explicitly states the correction; pass their words as note. Corrections are permanent user authority — ingestion never overwrites them.",
      inputSchema: correctLoreInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => jsonText(await mcpCorrectLore(ctx, args))
  );

  return server;
}
