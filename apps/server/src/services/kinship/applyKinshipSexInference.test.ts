import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('applyNameSexInference', () => {
  let updateSpy: (patch: Record<string, unknown>) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    updateSpy = vi.fn();
  });

  async function mockCharacterRow(row: { metadata: Record<string, unknown> | null }) {
    const { supabaseAdmin } = await import('../supabaseClient');
    (supabaseAdmin as any).from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updateSpy(patch);
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      },
    }));
  }

  it('soft-writes sex from a confident first-name guess into an empty slot', async () => {
    await mockCharacterRow({ metadata: {} });
    const { applyNameSexInference } = await import('./applyKinshipSexInference');

    const changed = await applyNameSexInference('user-1', 'char-1', 'Michael Rivera');

    expect(changed).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ sex: 'male', sex_source: 'name_inferred' }),
      }),
    );
  });

  it('does not write anything for an unrecognized or unisex name', async () => {
    await mockCharacterRow({ metadata: {} });
    const { applyNameSexInference } = await import('./applyKinshipSexInference');

    const changed = await applyNameSexInference('user-1', 'char-1', 'Jordan');

    expect(changed).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('never overwrites a kinship-inferred sex, even with a confident name guess', async () => {
    await mockCharacterRow({ metadata: { sex: 'female', sex_source: 'kinship_inferred' } });
    const { applyNameSexInference } = await import('./applyKinshipSexInference');

    const changed = await applyNameSexInference('user-1', 'char-1', 'Michael');

    expect(changed).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('never overwrites a user-confirmed sex', async () => {
    await mockCharacterRow({ metadata: { sex: 'female', sex_source: 'user_confirmed' } });
    const { applyNameSexInference } = await import('./applyKinshipSexInference');

    const changed = await applyNameSexInference('user-1', 'char-1', 'Michael');

    expect(changed).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
