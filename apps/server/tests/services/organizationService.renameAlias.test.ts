import { describe, it, expect, vi, beforeEach } from 'vitest';
import { organizationService } from '../../src/services/organizationService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/services/groupAnalyticsService', () => ({
  groupAnalyticsService: { calculateAnalytics: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function emptyListChain() {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve({ data: [], error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null })),
  };
  return chain;
}

describe('organizationService.updateOrganization — auto-alias on rename', () => {
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    updateSpy = vi.fn();
  });

  function mockOrgTable(opts: { currentName: string; currentAliases: string[]; updatedRow: Record<string, unknown> }) {
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table !== 'organizations') return emptyListChain();

      const selectChain: any = {
        select: (cols: string) => {
          // Distinguish the pre-update lookup (name, aliases) from getOrganization's full select.
          if (cols === 'name, aliases') {
            return {
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { name: opts.currentName, aliases: opts.currentAliases },
                      error: null,
                    }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: opts.updatedRow, error: null }),
              }),
            }),
          };
        },
        update: (patch: Record<string, unknown>) => {
          updateSpy(patch);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: () => Promise.resolve({ data: opts.updatedRow, error: null }),
                }),
              }),
            }),
          };
        },
      };
      return selectChain;
    });
  }

  it('adds the previous name to aliases when renaming, if not already present', async () => {
    mockOrgTable({
      currentName: 'Amazon',
      currentAliases: [],
      updatedRow: { id: 'org-1', name: 'Amazon Ring', aliases: ['Amazon'] },
    });

    await organizationService.updateOrganization('user-1', 'org-1', { name: 'Amazon Ring' });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Amazon Ring', aliases: ['Amazon'] }),
    );
  });

  it('does not duplicate the previous name if it is already an alias', async () => {
    mockOrgTable({
      currentName: 'Amazon',
      currentAliases: ['AMZN'],
      updatedRow: { id: 'org-1', name: 'Amazon Ring', aliases: ['AMZN', 'Amazon'] },
    });

    await organizationService.updateOrganization('user-1', 'org-1', {
      name: 'Amazon Ring',
      aliases: ['AMZN', 'amazon'],
    });

    const patch = updateSpy.mock.calls[0][0];
    const lowered = (patch.aliases as string[]).map((a) => a.toLowerCase());
    expect(lowered.filter((a) => a === 'amazon')).toHaveLength(1);
  });

  it('does not touch aliases when the name is unchanged (no-op save)', async () => {
    mockOrgTable({
      currentName: 'Amazon Ring',
      currentAliases: ['Amazon'],
      updatedRow: { id: 'org-1', name: 'Amazon Ring', aliases: ['Amazon'] },
    });

    await organizationService.updateOrganization('user-1', 'org-1', { name: 'Amazon Ring' });

    const patch = updateSpy.mock.calls[0][0];
    expect(patch.aliases).toEqual(['Amazon']);
  });

  it('leaves aliases untouched when neither name nor aliases are part of the update', async () => {
    mockOrgTable({
      currentName: 'Amazon Ring',
      currentAliases: ['Amazon'],
      updatedRow: { id: 'org-1', name: 'Amazon Ring', description: 'Updated', aliases: ['Amazon'] },
    });

    await organizationService.updateOrganization('user-1', 'org-1', { description: 'Updated' });

    const patch = updateSpy.mock.calls[0][0];
    expect(patch).not.toHaveProperty('aliases');
    expect(patch).not.toHaveProperty('name');
  });
});
