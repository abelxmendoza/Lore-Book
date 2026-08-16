import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { characterConnectionService, parseStoryAssociationId } from './characterConnectionService';
import { supabaseAdmin } from './supabaseClient';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

describe('parseStoryAssociationId', () => {
  it('parses inferred story-association ids used by the character modal', () => {
    const source = '11111111-1111-4111-8111-111111111111';
    const target = '22222222-2222-4222-8222-222222222222';
    expect(parseStoryAssociationId(`story-association-${source}-${target}`)).toEqual({
      sourceId: source,
      targetId: target,
    });
  });

  it('rejects real relationship UUIDs so DELETE still uses the graph table', () => {
    expect(parseStoryAssociationId('11111111-1111-4111-8111-111111111111')).toBeNull();
  });
});

describe('characterConnectionService.recordCoMention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockCharacters(rows: Array<{ id: string; associated_with_character_ids: string[]; metadata: Record<string, unknown> }>) {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'characters') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }) };
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: rows, error: null }),
        update: updateSpy,
      };
    });
    return updateSpy;
  }

  it('records "met through X" origin provenance the first time two characters are connected', async () => {
    const updateSpy = mockCharacters([
      { id: 'char-a', associated_with_character_ids: [], metadata: {} },
      { id: 'char-b', associated_with_character_ids: [], metadata: {} },
    ]);

    const added = await characterConnectionService.recordCoMention(
      'user-1',
      ['char-a', 'char-b'],
      { entityType: 'organization', entityId: 'org-1', entityName: 'Amazon' },
    );

    expect(added).toBe(2);
    const charAUpdate = updateSpy.mock.calls.find(
      ([payload]) => payload.associated_with_character_ids.includes('char-b'),
    )?.[0];
    expect(charAUpdate.metadata.connection_origins['char-b']).toMatchObject({
      entityType: 'organization',
      entityId: 'org-1',
      entityName: 'Amazon',
    });
  });

  it('never overwrites an already-recorded origin — first context wins', async () => {
    const existingOrigin = {
      entityType: 'organization',
      entityId: 'org-original',
      entityName: 'Original Employer',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
    };
    const updateSpy = mockCharacters([
      {
        id: 'char-a',
        associated_with_character_ids: ['char-b'],
        metadata: { connection_origins: { 'char-b': existingOrigin } },
      },
      { id: 'char-b', associated_with_character_ids: ['char-a'], metadata: {} },
    ]);

    await characterConnectionService.recordCoMention(
      'user-1',
      ['char-a', 'char-b'],
      { entityType: 'organization', entityId: 'org-new', entityName: 'Different Org' },
    );

    // char-a already had both the edge and an origin for char-b — no write at
    // all happens for it, so its stored origin is provably untouched.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [payload] = updateSpy.mock.calls[0];
    // The one write that does happen is char-b recording its own (still-missing)
    // origin for char-a — a different pair, not an overwrite of char-a's origin.
    expect(payload.metadata.connection_origins['char-a']).toMatchObject({ entityId: 'org-new' });
  });

  it('does not attach origin context when none is provided (plain co-mention)', async () => {
    const updateSpy = mockCharacters([
      { id: 'char-a', associated_with_character_ids: [], metadata: {} },
      { id: 'char-b', associated_with_character_ids: [], metadata: {} },
    ]);

    await characterConnectionService.recordCoMention('user-1', ['char-a', 'char-b']);

    for (const [payload] of updateSpy.mock.calls) {
      expect(payload.metadata).toBeUndefined();
    }
  });
});
