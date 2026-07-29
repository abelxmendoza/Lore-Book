import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { NarrativeChapter, StitchedTimelineItem } from '../api/stitchedTimeline';
import {
  buildStitchedTimelineChatPrompt,
  buildStitchedTimelineFollowUpPrompts,
  buildStitchedTimelineKnowledgeScope,
  meterFromStitchedTimeline,
  openStitchedTimelineChat,
  stitchedItemsToChronologyEntries,
} from './stitchedTimelineChat';

const chapter: NarrativeChapter = {
  title: 'Agency Years',
  thesis: 'Building OrbitPad while spending time with Grandma Nell.',
  dominantTheme: 'Building with family',
  startDate: '2026-06-01',
  endDate: '2026-06-03',
  participants: ['Grandma Nell', 'Marcus'],
  locations: ['Grandma home'],
  supportingEventIds: ['e1', 'e2'],
  backgroundEventIds: [],
  backgroundContext: ['Recently graduated.'],
  outcomes: ['OrbitPad moved forward.'],
  contributionScores: {},
  quality: { overallStoryQuality: 88 },
  confidence: 0.9,
};

const items: StitchedTimelineItem[] = [
  {
    id: 'i1',
    kind: 'event',
    sourceId: 'e1',
    sortTime: '2026-06-01T12:00:00Z',
    userSortIndex: null,
    title: 'Sketching OrbitPad',
    body: 'We sketched the first OrbitPad screens at the kitchen table with Grandma Nell watching.',
    sourceKind: 'resolved_event',
    sourceIds: ['e1'],
    sourceType: 'event',
  },
  {
    id: 'i2',
    kind: 'moment',
    sourceId: 'e2',
    sortTime: '2026-06-03T15:00:00Z',
    userSortIndex: null,
    title: 'Prototype walkthrough',
    body: 'Marcus reviewed the prototype and we talked about shipping next month.',
    sourceKind: 'journal_entry',
    sourceIds: ['e2'],
    sourceType: 'journal',
  },
];

describe('stitchedTimelineChat', () => {
  beforeEach(() => {
    vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps stitched items into chronology entries for the meter', () => {
    const entries = stitchedItemsToChronologyEntries(items);
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe('Sketching OrbitPad');
    expect(entries[0].content).toContain('kitchen table');
  });

  it('builds a knowledge scope from chapter metadata', () => {
    const scope = buildStitchedTimelineKnowledgeScope({
      title: 'Agency Years',
      lifeArcId: 'arc-1',
      items,
      chapter,
      scopeType: 'life_arc',
    });
    expect(scope).toMatch(/life arc chapter/);
    expect(scope).toMatch(/Building with family/);
    expect(scope).toMatch(/Grandma Nell/);
    expect(scope).toMatch(/2 supporting scenes/);
  });

  it('builds an exploratory chat prompt and follow-ups', () => {
    const prompt = buildStitchedTimelineChatPrompt({
      title: 'Agency Years',
      items,
      chapter,
    });
    expect(prompt).toMatch(/stitched timeline “Agency Years”/);
    expect(prompt).toMatch(/connect people\/places\/projects/);

    const followUps = buildStitchedTimelineFollowUpPrompts({
      title: 'Agency Years',
      items,
      chapter,
    });
    expect(followUps.some((p) => /Who else connects/i.test(p))).toBe(true);
    expect(followUps.some((p) => /outcome change what came next/i.test(p))).toBe(true);
  });

  it('counts relevant chapter content on the vignette / LoreBook meter', () => {
    const { offer, meter } = meterFromStitchedTimeline({
      title: 'Agency Years',
      items,
      chapter,
    });
    expect(offer.eventCount).toBe(2);
    expect(offer.uniqueDays).toBe(2);
    expect(offer.wordCount).toBeGreaterThan(10);
    expect(meter.counterLabel).toBeTruthy();
    expect(meter.tierOffer).toBeTruthy();
  });

  it('opens main chat with timeline focus and knowledge scope', () => {
    openStitchedTimelineChat({
      title: 'Agency Years',
      lifeArcId: 'arc-1',
      items,
      chapter,
      scopeType: 'life_arc',
    });

    expect(window.dispatchEvent).toHaveBeenCalled();
    const event = vi.mocked(window.dispatchEvent).mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('lorebook:open-chat-focus');
    expect(event.detail.sourceSurface).toBe('timeline');
    expect(event.detail.entityName).toBe('Agency Years');
    expect(event.detail.knowledgeScope).toMatch(/Building with family/);
    expect(event.detail.startNewThread).toBe(true);
  });
});
