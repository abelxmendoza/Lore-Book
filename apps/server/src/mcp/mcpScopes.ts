import type { McpAuthContext } from './types';

const PROPOSE_SCOPES = new Set(['memory:propose', 'memory:write', 'memory:admin']);
const DIRECT_WRITE_SCOPES = new Set(['memory:write', 'memory:admin']);

export function hasAnyScope(ctx: Pick<McpAuthContext, 'scopes'>, allowed: Set<string>): boolean {
  return ctx.scopes.some((scope) => allowed.has(scope));
}

/** Queue a review item. Does not grant canon writes. */
export function canProposeMemory(ctx: Pick<McpAuthContext, 'scopes'>): boolean {
  return hasAnyScope(ctx, PROPOSE_SCOPES);
}

/** ingest_story / correct_lore. Not granted to hivemind agent tokens. */
export function canDirectWriteMemory(ctx: Pick<McpAuthContext, 'scopes'>): boolean {
  return hasAnyScope(ctx, DIRECT_WRITE_SCOPES);
}
