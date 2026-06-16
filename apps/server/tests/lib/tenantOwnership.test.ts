import { describe, it, expect, vi, beforeEach } from 'vitest';

import { supabaseAdmin } from '../../src/services/supabaseClient';
import {
  TenantAccessError,
  assertJournalEntryOwned,
  assertMemoryComponentOwned,
  assertOmegaEntityOwned,
} from '../../src/lib/tenantOwnership';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

function chain(result: { data: unknown; error: unknown }) {
  const proxy: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'maybeSingle', 'single']) {
    proxy[method] = vi.fn().mockReturnValue(proxy);
  }
  proxy.maybeSingle = vi.fn().mockResolvedValue(result);
  proxy.single = vi.fn().mockResolvedValue(result);
  return proxy;
}

describe('tenantOwnership helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TenantAccessError has stable name', () => {
    const err = new TenantAccessError('Entity not found');
    expect(err.name).toBe('TenantAccessError');
  });

  it('assertOmegaEntityOwned throws when entity missing for user', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      chain({ data: null, error: null }) as never
    );
    await expect(assertOmegaEntityOwned('user-a', 'entity-b')).rejects.toThrow(TenantAccessError);
  });

  it('assertOmegaEntityOwned passes when entity belongs to user', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      chain({ data: { id: 'entity-b' }, error: null }) as never
    );
    await expect(assertOmegaEntityOwned('user-a', 'entity-b')).resolves.toBeUndefined();
  });

  it('assertMemoryComponentOwned throws when journal entry is foreign', async () => {
    vi.mocked(supabaseAdmin.from)
      .mockReturnValueOnce(chain({ data: { journal_entry_id: 'entry-1' }, error: null }) as never)
      .mockReturnValueOnce(chain({ data: null, error: null }) as never);

    await expect(assertMemoryComponentOwned('user-a', 'comp-b')).rejects.toThrow(TenantAccessError);
  });

  it('assertJournalEntryOwned throws for foreign entry', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      chain({ data: null, error: null }) as never
    );
    await expect(assertJournalEntryOwned('user-a', 'entry-b')).rejects.toThrow(TenantAccessError);
  });
});
