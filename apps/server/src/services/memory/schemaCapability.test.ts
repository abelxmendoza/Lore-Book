import { describe, it, expect, vi, beforeEach } from 'vitest';

import { columnsExist, __resetSchemaCapabilityCache, type CapabilityClient } from './schemaCapability';

beforeEach(() => __resetSchemaCapabilityCache());

function probeClient(result: { error: unknown } | (() => never)) {
  const limit = vi.fn(async () => (typeof result === 'function' ? result() : result));
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as CapabilityClient, from, select, limit };
}

describe('columnsExist', () => {
  it('returns true when the probe select succeeds', async () => {
    const { client, select } = probeClient({ error: null });
    await expect(columnsExist(client, 'omega_claims', ['lifecycle_state'])).resolves.toBe(true);
    expect(select).toHaveBeenCalledWith('lifecycle_state');
  });

  it('returns false when the column is missing (probe errors)', async () => {
    const { client } = probeClient({ error: { code: '42703', message: 'column does not exist' } });
    await expect(columnsExist(client, 'omega_claims', ['lifecycle_state'])).resolves.toBe(false);
  });

  it('returns false (no throw) when the probe throws', async () => {
    const { client } = probeClient(() => {
      throw new Error('connection refused');
    });
    await expect(columnsExist(client, 'omega_claims', ['x'])).resolves.toBe(false);
  });

  it('caches the result — probes only once per (table, columns)', async () => {
    const { client, limit } = probeClient({ error: null });
    await columnsExist(client, 'omega_claims', ['lifecycle_state']);
    await columnsExist(client, 'omega_claims', ['lifecycle_state']);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('treats column order as equivalent (same cache key)', async () => {
    const { client, limit } = probeClient({ error: null });
    await columnsExist(client, 't', ['a', 'b']);
    await columnsExist(client, 't', ['b', 'a']);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('re-probes after a cache reset (simulates restart)', async () => {
    const { client, limit } = probeClient({ error: null });
    await columnsExist(client, 't', ['a']);
    __resetSchemaCapabilityCache();
    await columnsExist(client, 't', ['a']);
    expect(limit).toHaveBeenCalledTimes(2);
  });
});
