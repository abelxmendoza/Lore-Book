import { describe, expect, it, vi, beforeEach } from 'vitest';

const { fromMock, arcServiceMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  arcServiceMock: {
    getById: vi.fn(),
    getRootArcs: vi.fn(),
    listForUser: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock('./arcService', () => ({
  arcService: arcServiceMock,
}));

import { arcNarrativeService } from './arcNarrativeService';

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = vi.fn(self);
  builder.insert = vi.fn(self);
  builder.delete = vi.fn(self);
  builder.eq = vi.fn(self);
  builder.order = vi.fn(self);
  builder.single = vi.fn().mockResolvedValue(result);
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}

describe('arcNarrativeService', () => {
  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSagas / getArcsInSaga — Saga reuses life_arcs.parent_id', () => {
    it('getSagas delegates to arcService.getRootArcs (no new table)', async () => {
      arcServiceMock.getRootArcs.mockResolvedValue([{ id: 'saga-1' }]);
      const result = await arcNarrativeService.getSagas(userId);
      expect(arcServiceMock.getRootArcs).toHaveBeenCalledWith(userId);
      expect(result).toEqual([{ id: 'saga-1' }]);
    });

    it('a saga can contain arcs from multiple tracks', async () => {
      arcServiceMock.listForUser.mockResolvedValue([
        { id: 'arc-career', parent_id: 'saga-1', track: 'career' },
        { id: 'arc-creative', parent_id: 'saga-1', track: 'creative' },
        { id: 'arc-unrelated', parent_id: 'saga-2', track: 'health' },
      ]);
      const result = await arcNarrativeService.getArcsInSaga(userId, 'saga-1');
      expect(result.map((a) => a.id)).toEqual(['arc-career', 'arc-creative']);
      expect(new Set(result.map((a) => a.track))).toEqual(new Set(['career', 'creative']));
    });

    it('setArcParent verifies the target saga is owned by this user before assigning', async () => {
      arcServiceMock.getById.mockResolvedValue(null); // not found / not owned
      await expect(arcNarrativeService.setArcParent(userId, 'arc-1', 'someone-elses-saga')).rejects.toThrow(
        /not found or not owned/i
      );
      expect(arcServiceMock.update).not.toHaveBeenCalled();
    });

    it('setArcParent(null) detaches without an ownership lookup', async () => {
      arcServiceMock.update.mockResolvedValue({ id: 'arc-1', parent_id: null });
      await arcNarrativeService.setArcParent(userId, 'arc-1', null);
      expect(arcServiceMock.getById).not.toHaveBeenCalled();
      expect(arcServiceMock.update).toHaveBeenCalledWith(userId, 'arc-1', { parent_id: null });
    });
  });

  describe('attachAnchor — mitigates the arc_event_links RLS ownership gap at the application layer', () => {
    it('rejects an unowned/nonexistent arc before ever inserting a link', async () => {
      arcServiceMock.getById.mockResolvedValue(null);
      await expect(
        arcNarrativeService.attachAnchor(userId, { arcId: 'not-mine', role: 'origin', journalEntryId: 'j-1' })
      ).rejects.toThrow(/not found or not owned/i);
      expect(fromMock).not.toHaveBeenCalled();
    });

    it('rejects an invalid role before touching the database', async () => {
      await expect(
        arcNarrativeService.attachAnchor(userId, {
          arcId: 'arc-1',
          // @ts-expect-error deliberately invalid for the test
          role: 'not_a_real_role',
          journalEntryId: 'j-1',
        })
      ).rejects.toThrow(/invalid narrative anchor role/i);
      expect(arcServiceMock.getById).not.toHaveBeenCalled();
    });

    it('requires a resolvedEventId or journalEntryId target', async () => {
      await expect(
        arcNarrativeService.attachAnchor(userId, { arcId: 'arc-1', role: 'origin' })
      ).rejects.toThrow(/requires resolvedEventId or journalEntryId/i);
    });

    it('stores the narrative role inside metadata, not a new column', async () => {
      arcServiceMock.getById.mockResolvedValue({ id: 'arc-1', user_id: userId });
      const insertResult = {
        data: {
          id: 'link-1',
          arc_id: 'arc-1',
          resolved_event_id: null,
          journal_entry_id: 'journal-1',
          importance_score: 0.8,
          sort_time: '2026-05-01T00:00:00.000Z',
          created_at: '2026-05-01T00:00:00.000Z',
          metadata: { narrative_role: 'turning_point' },
        },
        error: null,
      };
      const builder = chain(insertResult);
      fromMock.mockReturnValue(builder);

      const anchor = await arcNarrativeService.attachAnchor(userId, {
        arcId: 'arc-1',
        role: 'turning_point',
        journalEntryId: 'journal-1',
        importanceScore: 0.8,
      });

      expect(fromMock).toHaveBeenCalledWith('arc_event_links');
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          arc_id: 'arc-1',
          journal_entry_id: 'journal-1',
          metadata: { narrative_role: 'turning_point' },
        })
      );
      expect(anchor.role).toBe('turning_point');
      expect(anchor.importanceScore).toBe(0.8);
    });

    it('the same event can hold different roles via two separate link rows (role belongs to the relationship)', async () => {
      arcServiceMock.getById.mockResolvedValue({ id: 'arc-x', user_id: userId });

      const linkAsOrigin = chain({
        data: { id: 'link-a', arc_id: 'arc-1', journal_entry_id: 'journal-shared', metadata: { narrative_role: 'origin' } },
        error: null,
      });
      const linkAsEnding = chain({
        data: { id: 'link-b', arc_id: 'arc-2', journal_entry_id: 'journal-shared', metadata: { narrative_role: 'ending' } },
        error: null,
      });
      fromMock.mockReturnValueOnce(linkAsOrigin).mockReturnValueOnce(linkAsEnding);

      const a = await arcNarrativeService.attachAnchor(userId, { arcId: 'arc-1', role: 'origin', journalEntryId: 'journal-shared' });
      const b = await arcNarrativeService.attachAnchor(userId, { arcId: 'arc-2', role: 'ending', journalEntryId: 'journal-shared' });

      expect(a.role).toBe('origin');
      expect(b.role).toBe('ending');
      expect(a.journalEntryId).toBe(b.journalEntryId);
    });
  });

  describe('removeAnchor — unlinks without touching the canonical event', () => {
    it('only deletes from arc_event_links, never from resolved_events/journal_entries', async () => {
      const builder = chain({ data: null, error: null });
      fromMock.mockReturnValue(builder);

      await arcNarrativeService.removeAnchor(userId, 'link-1');

      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledWith('arc_event_links');
      expect(fromMock).not.toHaveBeenCalledWith('resolved_events');
      expect(fromMock).not.toHaveBeenCalledWith('journal_entries');
      expect(builder.delete).toHaveBeenCalled();
    });
  });
});
