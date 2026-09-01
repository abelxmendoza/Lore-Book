import { afterEach, describe, expect, it, vi } from 'vitest';

import { stitchedTimelineService, type StitchedTimelineItem } from '../../chronologyV2/stitchedTimelineService';

import { arcService } from './arcService';
import { buildArcProposalsFromItems, LifeArcProposalService, proposalMatchesPriorDecision } from './lifeArcProposalService';

afterEach(() => {
  vi.restoreAllMocks();
});

function event(overrides: Partial<StitchedTimelineItem>): StitchedTimelineItem {
  const sourceId = overrides.sourceId ?? 'event-1';
  return {
    id: `event:${sourceId}`,
    kind: 'event',
    sourceId,
    sourceIds: [sourceId],
    sourceKind: 'resolved_event',
    sourceType: 'chat',
    sortTime: overrides.occurredAt ?? '2026-01-01T00:00:00.000Z',
    userSortIndex: null,
    title: 'Vanguard Robotics milestone',
    body: 'Marcus shipped a project at Vanguard Robotics.',
    occurredAt: '2026-01-01T00:00:00.000Z',
    confidence: 0.9,
    timeConfidence: 0.9,
    ...overrides,
  };
}

describe('buildArcProposalsFromItems', () => {
  it('builds an evidence-backed multi-day proposal from canonical items', () => {
    const proposals = buildArcProposalsFromItems([
      event({ sourceId: 'one', occurredAt: '2026-01-01T00:00:00.000Z' }),
      event({ sourceId: 'two', occurredAt: '2026-03-01T00:00:00.000Z' }),
    ]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      arc_type: 'work',
      track: 'career',
      start_date: '2026-01-01',
      end_date: '2026-03-01',
      source_record_ids: ['resolved_event:one', 'resolved_event:two'],
    });
    expect(proposals[0].evidence).toHaveLength(2);
    expect(proposals[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('captures intake channel, sources, and entities on evidence', () => {
    const proposals = buildArcProposalsFromItems([
      event({
        sourceId: 'one',
        sourceType: 'chat',
        metadata: { source_message_id: 'msg-1', people: ['char-1'] },
        occurredAt: '2026-01-01T00:00:00.000Z',
      }),
      event({
        sourceId: 'two',
        sourceType: 'document_upload',
        metadata: { source_file_id: 'file-1' },
        occurredAt: '2026-03-01T00:00:00.000Z',
      }),
    ]);

    expect(proposals).toHaveLength(1);
    const first = proposals[0]?.evidence[0];
    expect(first?.intakeChannel).toBe('chat');
    expect(first?.sources.some((source) => source.kind === 'chat_message' && source.id === 'msg-1')).toBe(true);
    expect(first?.entities).toEqual([{ kind: 'character', id: 'char-1' }]);
  });

  it('is deterministic and ignores single-day or unresolved material', () => {
    const items = [
      event({ sourceId: 'two', occurredAt: '2026-03-01T00:00:00.000Z' }),
      event({ sourceId: 'one', occurredAt: '2026-01-01T00:00:00.000Z' }),
      event({ sourceId: 'unresolved', occurredAt: null, occurrenceStatus: 'unresolved' }),
    ];
    const first = buildArcProposalsFromItems(items);
    const second = buildArcProposalsFromItems([...items].reverse());
    expect(first[0].fingerprint).toBe(second[0].fingerprint);

    expect(buildArcProposalsFromItems([
      event({ sourceId: 'a', occurredAt: '2026-01-01T01:00:00.000Z' }),
      event({ sourceId: 'b', occurredAt: '2026-01-01T20:00:00.000Z' }),
    ])).toEqual([]);
  });

  it('does not merge evidence separated by more than six months', () => {
    expect(buildArcProposalsFromItems([
      event({ sourceId: 'one', occurredAt: '2024-01-01T00:00:00.000Z' }),
      event({ sourceId: 'two', occurredAt: '2025-01-01T00:00:00.000Z' }),
    ])).toEqual([]);
  });

  it('builds from older canonical lore without a recent-activity window', () => {
    const proposals = buildArcProposalsFromItems([
      event({ sourceId: 'old-one', occurredAt: '2012-02-01T00:00:00.000Z' }),
      event({ sourceId: 'old-two', occurredAt: '2012-05-01T00:00:00.000Z' }),
    ]);
    expect(proposals[0]).toMatchObject({ start_date: '2012-02-01', end_date: '2012-05-01' });
  });

  it('keeps a dismissed overlapping proposal resolved when new evidence expands it', () => {
    const draft = buildArcProposalsFromItems([
      event({ sourceId: 'one', occurredAt: '2026-01-01T00:00:00.000Z' }),
      event({ sourceId: 'two', occurredAt: '2026-03-01T00:00:00.000Z' }),
      event({ sourceId: 'three', occurredAt: '2026-04-01T00:00:00.000Z' }),
    ])[0];
    expect(proposalMatchesPriorDecision(draft, {
      track: 'career',
      start_date: '2026-01-01',
      end_date: '2026-03-01',
      source_record_ids: ['resolved_event:one', 'resolved_event:two'],
      status: 'dismissed',
    })).toBe(true);
    expect(proposalMatchesPriorDecision(draft, {
      track: 'health',
      start_date: '2026-01-01',
      end_date: '2026-03-01',
      source_record_ids: ['resolved_event:one'],
      status: 'dismissed',
    })).toBe(false);
  });
});

describe('LifeArcProposalService audit', () => {
  it('loads canonical timeline evidence and existing arcs through their services', async () => {
    vi.spyOn(stitchedTimelineService, 'getStitchedTimeline').mockResolvedValue({
      items: [
        event({ sourceId: 'one', occurredAt: '2026-01-01T00:00:00.000Z' }),
        event({ sourceId: 'two', occurredAt: '2026-03-01T00:00:00.000Z' }),
      ],
      unresolved_items: [],
      data_errors: [{ source: 'timeline_events', message: 'PGRST205: missing from schema cache' }],
    } as never);
    vi.spyOn(arcService, 'listForUser').mockResolvedValue([]);

    const result = await new LifeArcProposalService().audit('synthetic-user');

    expect(result.audit).toMatchObject({
      canonicalItems: 2,
      datedItems: 2,
      existingArcs: 0,
      drawableArcs: 0,
      proposedArcs: 1,
      dataErrors: [],
    });
    expect(result.drafts).toHaveLength(1);
  });
});
