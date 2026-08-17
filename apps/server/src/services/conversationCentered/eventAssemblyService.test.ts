import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  upsertMoment: vi.fn(),
  markMomentPromoted: vi.fn().mockResolvedValue(undefined),
  linkMomentGraph: vi.fn().mockResolvedValue(undefined),
  upsertScene: vi.fn(),
  markScenePromoted: vi.fn().mockResolvedValue(undefined),
  assessAndPersistMilestone: vi.fn().mockResolvedValue(null),
  upsertChapter: vi.fn().mockResolvedValue(null),
}));

vi.mock('../supabaseClient', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('../../logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } }));
vi.mock('../beliefRealityReconciliationService', () => ({ beliefRealityReconciliationService: {} }));
vi.mock('../confidenceTrackingService', () => ({ confidenceTrackingService: {} }));
vi.mock('../knowledgeTypeEngineService', () => ({ knowledgeTypeEngineService: {} }));
vi.mock('../metaControlService', () => ({ metaControlService: {} }));
vi.mock('../omegaMemoryService', () => ({ omegaMemoryService: {} }));
vi.mock('../narrative/narrativeMomentService', () => ({
  narrativeMomentService: { upsertMoment: h.upsertMoment, markPromoted: h.markMomentPromoted },
}));
vi.mock('../narrative/narrativeSceneService', () => ({
  narrativeSceneService: {
    linkMomentGraph: h.linkMomentGraph,
    upsertScene: h.upsertScene,
    markPromoted: h.markScenePromoted,
  },
}));
vi.mock('../narrative/milestoneClassifier', () => ({
  assessAndPersistMilestone: h.assessAndPersistMilestone,
}));
vi.mock('../narrative/narrativeStoryChapterService', () => ({
  narrativeStoryChapterService: { upsertChapter: h.upsertChapter },
}));

import { supabaseAdmin } from '../supabaseClient';
import { EventAssemblyService } from './eventAssemblyService';

const extractTitle = (units: Array<{ content: string }>) =>
  (new EventAssemblyService() as any).extractEventTitle(units) as string;

const extractWhen = (units: Array<{ content: string; created_at?: string }>, timezone?: string) =>
  (new EventAssemblyService() as any).extractWhen(units, timezone) as
    | { start: string; end: string | null; label?: string } & Record<string, unknown>
    | null;

describe('EventAssemblyService.extractEventTitle', () => {
  it('returns no title for an empty failed extraction', () => {
    const title = extractTitle([]);
    expect(title.toLowerCase()).not.toContain('untitled');
    expect(title).toBe('');
  });

  it('builds a contextual title from unit content', () => {
    const title = extractTitle([
      { content: 'Went to Costco with Grandma Rose and bought groceries for the week.' },
    ]);
    expect(title.toLowerCase()).not.toContain('untitled');
    expect(title.toLowerCase()).toMatch(/costco|abuela|grocer/);
  });

  it('returns no title for whitespace-only content', () => {
    const title = extractTitle([{ content: '   ' }]);
    expect(title.toLowerCase()).not.toContain('untitled');
    expect(title).toBe('');
  });

  it.each([
    ['I briefly saw her at Ska Prom.', 'Ska Prom'],
    ['I went to Catch One for the Anime Expo afters over Fourth of July weekend.', 'Anime Expo Afters at Catch One'],
    ["I stayed at Tia Grace's house for Memorial Day weekend.", "Memorial Day Weekend at Tia Grace's House"],
    ['I started onboarding for Amazon Ring through Kforce.', 'Amazon Ring Onboarding'],
    ['I am currently onboarding with Kforce.', 'Kforce Onboarding'],
    ['There was a conflict with Jenna and Voltra.', 'Conflict with Jenna and Voltra'],
    ['I hooked up with Ashley after the party.', 'Night with Ashley'],
  ])('recognizes a known life-event shape without using a raw sentence title', (content, expected) => {
    expect(extractTitle([{ content }])).toBe(expected);
  });
});

describe('EventAssemblyService.extractWhen — timezone', () => {
  // 2026-06-18T04:00:00Z = June 17, 9pm in Los Angeles (PDT, UTC-7).
  const crossBoundaryCreatedAt = '2026-06-18T04:00:00.000Z';
  const LA = 'America/Los_Angeles';

  function laDay(iso: string): string {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: LA });
  }

  it('resolves "yesterday" to the user\'s local calendar day when a timezone is passed', () => {
    const when = extractWhen(
      [{ content: 'I went out yesterday.', created_at: crossBoundaryCreatedAt }],
      LA,
    );
    expect(when).not.toBeNull();
    expect(laDay(when!.start)).toBe('2026-06-16');
  });

  it('defaults to UTC (matching the codebase default) when no timezone is passed', () => {
    // Regression test for the bug: eventAssemblyService.reconcileEvent's
    // second call to extractWhen previously omitted the timezone argument
    // entirely, silently resolving reconciled events in UTC instead of the
    // same user's timezone used everywhere else in this file.
    const withoutTz = extractWhen([{ content: 'I went out yesterday.', created_at: crossBoundaryCreatedAt }]);
    const withUtc = extractWhen(
      [{ content: 'I went out yesterday.', created_at: crossBoundaryCreatedAt }],
      'UTC',
    );
    expect(withoutTz?.start).toBe(withUtc?.start);
  });

  it('resolves a different real-instant window for LA than for Tokyo', () => {
    const la = extractWhen([{ content: 'I went out yesterday.', created_at: crossBoundaryCreatedAt }], LA);
    const tokyo = extractWhen(
      [{ content: 'I went out yesterday.', created_at: crossBoundaryCreatedAt }],
      'Asia/Tokyo',
    );
    expect(la?.start).not.toBe(tokyo?.start);
  });
});

describe('EventAssemblyService.assembleEvents — milestone wiring', () => {
  const userId = 'user-1';
  const now = new Date().toISOString();

  function mockExtractedUnitsQuery(units: unknown[]) {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table !== 'extracted_units') {
        return { select: () => ({ eq: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: [], error: null }) }) }) }) };
      }
      const builder: Record<string, any> = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => Promise.resolve({ data: units, error: null }),
      };
      return builder;
    });
  }

  const content = 'I went to Costco with Grandma Rose and decided to end things with the band for good.';

  function setup() {
    h.upsertMoment.mockResolvedValue({
      id: 'moment-1',
      summary: content,
      occurred_at: now,
      participants: ['Grandma Rose'],
      location: 'Costco',
      significance_score: 90,
      emotions: [],
    });
    h.upsertScene.mockResolvedValue({ id: 'scene-1', title: 'Costco trip with Grandma Rose', summary: content });
    h.assessAndPersistMilestone.mockClear();
    h.upsertChapter.mockClear();

    mockExtractedUnitsQuery([
      {
        id: 'unit-1',
        user_id: userId,
        type: 'EXPERIENCE',
        content,
        entity_ids: [],
        confidence: 0.9,
        created_at: now,
        metadata: {},
      },
    ]);
  }

  it('assesses a milestone for an event promoted from a Scene', async () => {
    setup();
    const service = new EventAssemblyService();
    vi.spyOn(service as any, 'createOrUpdateEvent').mockResolvedValue({ event_id: 'evt-1' });

    await service.assembleEvents(userId, 'thread-1');

    expect(h.assessAndPersistMilestone).toHaveBeenCalledWith(userId, 'evt-1');
  });

  it('does not assess a milestone when no event is promoted (rejected)', async () => {
    setup();
    const service = new EventAssemblyService();
    vi.spyOn(service as any, 'createOrUpdateEvent').mockResolvedValue({ rejected: true });

    await service.assembleEvents(userId, 'thread-1');

    expect(h.assessAndPersistMilestone).not.toHaveBeenCalled();
  });

  it('does not let a milestone-assessment failure fail the surrounding assembly', async () => {
    setup();
    h.assessAndPersistMilestone.mockRejectedValueOnce(new Error('milestone boom'));
    const service = new EventAssemblyService();
    vi.spyOn(service as any, 'createOrUpdateEvent').mockResolvedValue({ event_id: 'evt-2' });

    const results = await service.assembleEvents(userId, 'thread-1');

    expect(results.length).toBeGreaterThan(0);
  });

  it('lands isMilestone/milestoneScore on the chapter built from an eligible milestone event', async () => {
    setup();
    h.assessAndPersistMilestone.mockResolvedValue({ eligible: true, finalScore: 82.4 });
    const service = new EventAssemblyService();
    vi.spyOn(service as any, 'createOrUpdateEvent').mockResolvedValue({ event_id: 'evt-3' });

    await service.assembleEvents(userId, 'thread-1');

    expect(h.upsertChapter).toHaveBeenCalled();
    const { chapter } = h.upsertChapter.mock.calls[0][0];
    expect(chapter.milestoneIds).toEqual(['evt-3']);
    expect(chapter.topMilestoneScore).toBe(82);
  });

  it('leaves the chapter milestone-blind when the event is not milestone-eligible', async () => {
    setup();
    h.assessAndPersistMilestone.mockResolvedValue({ eligible: false, finalScore: 40 });
    const service = new EventAssemblyService();
    vi.spyOn(service as any, 'createOrUpdateEvent').mockResolvedValue({ event_id: 'evt-4' });

    await service.assembleEvents(userId, 'thread-1');

    expect(h.upsertChapter).toHaveBeenCalled();
    const { chapter } = h.upsertChapter.mock.calls[0][0];
    expect(chapter.milestoneIds).toEqual([]);
    expect(chapter.topMilestoneScore).toBe(0);
  });
});
