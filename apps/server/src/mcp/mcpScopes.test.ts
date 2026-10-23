import { describe, expect, it } from 'vitest';

import { canDirectWriteMemory, canProposeMemory } from './mcpScopes';

describe('MCP memory scopes', () => {
  it('read-only cannot propose or write', () => {
    const ctx = { scopes: ['memory:read'] };
    expect(canProposeMemory(ctx)).toBe(false);
    expect(canDirectWriteMemory(ctx)).toBe(false);
  });

  it('memory:propose can queue review items but cannot write canon tools', () => {
    const ctx = { scopes: ['memory:read', 'memory:propose'] };
    expect(canProposeMemory(ctx)).toBe(true);
    expect(canDirectWriteMemory(ctx)).toBe(false);
  });

  it('memory:write is a superset that still may propose', () => {
    const ctx = { scopes: ['memory:write'] };
    expect(canProposeMemory(ctx)).toBe(true);
    expect(canDirectWriteMemory(ctx)).toBe(true);
  });
});
