import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openTimelineItemDetail,
  resolveTimelineItemDetail,
} from './resolveTimelineItemDetail';

describe('resolveTimelineItemDetail', () => {
  it('routes a resolved_event to event detail using sourceId, not the canonical item id', () => {
    const resolution = resolveTimelineItemDetail({
      id: 'event:evt-1',
      kind: 'event',
      sourceKind: 'resolved_event',
      sourceId: 'evt-1',
      sourceType: 'resolved_event',
      peopleIds: ['char-marcus'],
      locationIds: ['loc-hq'],
    });
    expect(resolution.canonicalItemId).toBe('event:evt-1');
    expect(resolution.sourceKind).toBe('resolved_event');
    expect(resolution.sourceId).toBe('evt-1');
    expect(resolution.route).toBe('event');
    expect(resolution.diagnostics.detailRoute).toBe('event');
    expect(resolution.diagnostics.canonicalItemId).toBe('event:evt-1');
    expect(resolution.entityIds).toEqual({
      peopleIds: ['char-marcus'],
      locationIds: ['loc-hq'],
      organizationIds: [],
    });
  });

  it('routes a journal-backed moment to journal detail and never to resolved_event', () => {
    const resolution = resolveTimelineItemDetail({
      id: 'moment:journal-1',
      kind: 'moment',
      sourceKind: 'journal_entry',
      sourceId: 'journal-1',
      sourceType: 'journal',
    });
    expect(resolution.canonicalItemId).toBe('moment:journal-1');
    expect(resolution.sourceKind).toBe('journal_entry');
    expect(resolution.sourceId).toBe('journal-1');
    expect(resolution.route).toBe('journal');
    expect(resolution.unresolvedLinkageReason).toBe('missing_entity_ids');
  });

  it('routes an occasion to the life-arc container, not event detail', () => {
    const resolution = resolveTimelineItemDetail({
      id: 'occasion:occ-1',
      kind: 'occasion',
      sourceKind: 'occasion',
      sourceId: 'occ-1',
      lifeArcId: 'occ-1',
      title: 'Team dinner',
    });
    expect(resolution.route).toBe('occasion');
    expect(resolution.sourceKind).toBe('occasion');
    expect(resolution.sourceId).toBe('occ-1');
    expect(resolution.canonicalItemId).toBe('occasion:occ-1');
  });

  it('does not treat a raw journal UUID as a resolved_event id', () => {
    const resolution = resolveTimelineItemDetail({
      id: 'journal-1',
      kind: 'moment',
      sourceKind: 'journal_entry',
      sourceId: 'journal-1',
    });
    expect(resolution.route).not.toBe('event');
    expect(resolution.sourceId).toBe('journal-1');
  });

  it('keeps timeline_event off the conversation events route', () => {
    const resolution = resolveTimelineItemDetail({
      id: 'event:te-1',
      kind: 'event',
      sourceKind: 'timeline_event',
      sourceId: 'te-1',
    });
    expect(resolution.route).toBe('none');
    expect(resolution.unresolvedLinkageReason).toBe('timeline_event_not_resolved_event');
  });
});

describe('openTimelineItemDetail', () => {
  const openEvent = vi.fn();
  const openMemory = vi.fn();
  const openLifeArc = vi.fn();
  const fetchEvent = vi.fn();

  beforeEach(() => {
    openEvent.mockReset();
    openMemory.mockReset();
    openLifeArc.mockReset();
    fetchEvent.mockReset();
  });

  it('fetches resolved event detail by sourceId', async () => {
    fetchEvent.mockResolvedValue({ id: 'evt-1', title: 'Camping trip' });
    await openTimelineItemDetail(
      {
        id: 'event:evt-1',
        kind: 'event',
        sourceKind: 'resolved_event',
        sourceId: 'evt-1',
      },
      { openEvent, openMemory, fetchEvent },
    );
    expect(fetchEvent).toHaveBeenCalledWith('evt-1');
    expect(openEvent).toHaveBeenCalledWith({ id: 'evt-1', title: 'Camping trip' });
    expect(openMemory).not.toHaveBeenCalled();
  });

  it('opens journal/moment detail without calling the resolved-event API', async () => {
    await openTimelineItemDetail(
      {
        id: 'moment:journal-1',
        kind: 'moment',
        sourceKind: 'journal_entry',
        sourceId: 'journal-1',
        title: 'Late notes',
        body: 'Wrote it down.',
        sortTime: '2026-07-15T22:15:00.000Z',
      },
      { openEvent, openMemory, fetchEvent },
    );
    expect(fetchEvent).not.toHaveBeenCalled();
    expect(openEvent).not.toHaveBeenCalled();
    expect(openMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'journal-1',
        journal_entry_id: 'journal-1',
      }),
    );
  });

  it('opens occasion as a container, not /api/conversation/events/:id', async () => {
    await openTimelineItemDetail(
      {
        kind: 'occasion',
        sourceKind: 'occasion',
        sourceId: 'occ-1',
        lifeArcId: 'occ-1',
        title: 'Team dinner',
      },
      { openEvent, openMemory, openLifeArc, fetchEvent },
    );
    expect(fetchEvent).not.toHaveBeenCalled();
    expect(openLifeArc).toHaveBeenCalledWith('occ-1', 'Team dinner');
  });
});
