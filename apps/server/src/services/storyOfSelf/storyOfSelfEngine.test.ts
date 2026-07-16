/**
 * End-to-end regression test for the Story of Self engine, modeled on the
 * observed production failure: repeated onboarding memories, positive
 * belonging labeled "fall", "Era of <year>" chapters, raw chat fragments in
 * the output, name-collision contamination, and recency drowning out
 * foundational identity. Fictional cast only (check:founder-privacy).
 */
import { describe, expect, it, beforeAll } from 'vitest';

import type { MemoryEntry } from '../../types';

import type { KnownEntity } from './narrativeRecords';
import { StoryOfSelfEngine } from './storyOfSelfEngine';
import type { StoryOfSelf } from './types';

let seq = 0;
function entry(content: string, date: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  seq += 1;
  return {
    id: `fx${seq}`,
    user_id: 'u1',
    date,
    content,
    tags: [],
    source: 'chat',
    ...overrides,
  };
}

const ENTITIES: KnownEntity[] = [
  { id: 'diego-uncle', name: 'Diego', aliases: [], kind: 'person', relationshipRole: 'uncle', distinctFromIds: ['diego-scene'] },
  { id: 'diego-scene', name: 'Diego', aliases: ['Umbra'], kind: 'person', distinctFromIds: [] },
  { id: 'marcus', name: 'Marcus', aliases: [], kind: 'person', relationshipRole: 'coworker', distinctFromIds: [] },
  { id: 'rosa', name: 'Rosa', aliases: [], kind: 'person', relationshipRole: 'cousin', distinctFromIds: [] },
  { id: 'northwind', name: 'Northwind Labs', aliases: [], kind: 'organization', distinctFromIds: [] },
  { id: 'vanguard', name: 'Vanguard Robotics', aliases: [], kind: 'organization', distinctFromIds: [] },
];

/** Eight years of fictional history plus the noisy recent weeks. */
const CORPUS: MemoryEntry[] = [
  // Foundational identity
  entry('I grew up in a loud, close-knit family where nobody let you quit anything halfway.', '2018-03-10', { source: 'manual' }),
  entry('For many years I trained at a boxing gym before work; the discipline stuck with me.', '2019-02-14', { source: 'manual' }),

  // Early career
  entry('I started a new job washing dishes at a diner. Long shifts, but rent got paid.', '2019-05-02'),
  entry('Another double shift at the diner. I kept telling myself this was temporary.', '2019-08-19'),

  // Robotics field era
  entry('I got hired at Vanguard Robotics for field robotics work. Started the new job hauling rigs across test sites.', '2021-08-16', { mood: 'excited' }),
  entry('Field deployment with the Vanguard Robotics crew ran fourteen hours in the rain.', '2022-03-11'),
  entry('Fixed a drivetrain fault solo at a remote Vanguard Robotics site. Proved I could handle it.', '2022-10-05'),

  // Education
  entry('I graduated with my Computer Science degree. One of the biggest days of my life.', '2023-05-20', { mood: 'proud', source: 'manual' }),
  entry('Walked at graduation while my family cheered from the stands. I finished the degree while working full-time.', '2023-05-21'),

  // Long-term project
  entry('I started building a memory preservation app. I need to preserve these memories before they disappear.', '2025-11-03', { source: 'manual' }),
  entry('Shipped the first working prototype of the memory app tonight. Built the whole ingestion system myself.', '2026-02-18'),

  // Recent: new job onboarding (repeated near-duplicates)
  entry('I started my new job at Northwind Labs today. First day at the failure analysis lab.', '2026-06-08', { mood: 'excited' }),
  entry('First day at Northwind Labs — met the failure analysis lab team, started my new job.', '2026-06-08'),
  entry('Started my new job this week at Northwind Labs; the failure analysis lab is impressive.', '2026-06-09'),
  entry('Marcus leads the failure analysis department. He has a background in materials science.', '2026-06-10'),
  entry('Everyone at the new job is young and welcoming, really easy to connect with.', '2026-06-12', { mood: 'happy' }),
  entry('Second week at Northwind Labs: I got assigned my first solo failure report.', '2026-06-19'),
  entry("I'm in week four of onboarding and hoping I wake up on time tomorrow.", '2026-07-01', { mood: 'anxious' }),

  // Recent: family party with irrelevant detail
  entry("My tío Diego grilled all afternoon at Rosa's graduation party. I lost my vape and had too many seltzers.", '2026-06-21'),

  // Recent: nightlife with the scene Diego
  entry('Went to goth night with Diego — Umbra was on the decks until 2am.', '2026-06-28'),
  entry("Umbra's name is Diego. Do not confuse him with my tío Diego.", '2026-06-29', { source: 'manual' }),

  // Raw chat fragments that must never surface
  entry('over capacity???', '2026-07-02'),
  entry('aww what happened?', '2026-07-02'),
  entry('I was expecting more', '2026-07-02'),
];

describe('StoryOfSelfEngine end-to-end regression', () => {
  let story: StoryOfSelf;

  beforeAll(async () => {
    const engine = new StoryOfSelfEngine();
    story = await engine.process({
      entries: CORPUS,
      entities: ENTITIES,
      queryIntent: 'story_of_self',
      now: new Date('2026-07-10T12:00:00Z'),
    });
  });

  it('never leaks raw chat fragments or transcripts into the answer', () => {
    expect(story.summary).not.toMatch(/over capacity/i);
    expect(story.summary).not.toMatch(/aww what happened/i);
    expect(story.summary).not.toMatch(/i was expecting more/i);
    expect(story.summary).not.toMatch(/[?!]{3,}/);
    expect(story.voicePrint).toBe('');
    expect(story.trace.leakageCheckPassed).toBe(true);
    expect(story.trace.filteredFragmentCount).toBeGreaterThanOrEqual(3);
  });

  it('collapses repeated onboarding memories into one canonical event', () => {
    expect(story.trace.duplicateClusters).toBeGreaterThanOrEqual(1);
    const northwindStarts = Object.entries(story.synthesis.evidenceMap).filter(
      ([, evidenceIds]) => evidenceIds.length >= 3
    );
    expect(northwindStarts.length).toBeGreaterThanOrEqual(1);

    // No canonical event may appear twice across chapters.
    const referenced = story.synthesis.lifeChapters.flatMap((c) => c.eventIds);
    expect(new Set(referenced).size).toBe(referenced.length);
  });

  it('keeps coworker metadata as an entity fact, never a turning point', () => {
    for (const tp of story.turningPoints) {
      expect(tp.description).not.toMatch(/leads the failure analysis department/i);
      expect(tp.description).not.toMatch(/background in materials science/i);
    }
  });

  it('never labels positive onboarding belonging as a fall', () => {
    const falls = story.turningPoints.filter((tp) => tp.category === 'fall');
    expect(falls).toHaveLength(0);
    const fallAssessments = story.synthesis.turningPoints.filter((tp) => tp.arcLabel === 'fall');
    expect(fallAssessments).toHaveLength(0);
  });

  it('does not promote routine onboarding anxiety to awakening', () => {
    const awakenings = story.synthesis.turningPoints.filter((tp) => tp.arcLabel === 'awakening');
    for (const tp of awakenings) {
      expect(tp.event).not.toMatch(/wake up on time|week four/i);
    }
  });

  it('rejects weak turning-point candidates with explicit reasons', () => {
    expect(story.trace.rejectedTurningPoints.length).toBeGreaterThan(0);
    const reasons = new Set(story.trace.rejectedTurningPoints.map((r) => r.reason));
    expect(reasons.size).toBeGreaterThan(0);
  });

  it('accepts the real career transition as a turning point', () => {
    const tps = story.synthesis.turningPoints;
    expect(tps.length).toBeGreaterThan(0);
    const careerTp = tps.find((tp) => tp.affectedDomains.includes('career'));
    expect(careerTp).toBeDefined();
    expect(careerTp!.reasoning.length).toBeGreaterThan(10);
  });

  it('gives no chapter a bare year name', () => {
    for (const chapter of story.synthesis.lifeChapters) {
      expect(chapter.title).not.toMatch(/^(the\s+)?(era of\s+)?\d{4}$/i);
    }
    expect(story.trace.qualityGateResults.no_year_only_chapters).toBe(true);
  });

  it('covers foundational history, not just the recent 90 days', () => {
    const range = story.trace.dateRangeCovered;
    expect(range?.earliest?.slice(0, 4)).toBe('2018');
    expect(story.trace.qualityGateResults.recent_events_do_not_dominate).toBe(true);

    const chapterStarts = story.synthesis.lifeChapters
      .map((c) => c.startTime)
      .filter((d): d is string => Boolean(d))
      .sort();
    expect(Number(chapterStarts[0]?.slice(0, 4))).toBeLessThanOrEqual(2021);
  });

  it('incorporates identity facts into the identity summary', () => {
    expect(story.synthesis.identitySummary.length).toBeGreaterThan(40);
    expect(story.trace.qualityGateResults.sufficient_identity_coverage).toBe(true);
  });

  it('produces specific, multi-evidence themes rather than single abstract nouns', () => {
    expect(story.themes.length).toBeGreaterThan(0);
    for (const theme of story.themes) {
      expect(theme.theme.split(' ').length).toBeGreaterThanOrEqual(3);
      expect(['identity', 'connection', 'growth']).not.toContain(theme.theme.toLowerCase());
      expect(theme.evidence.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps the two Diegos separate', () => {
    // The family-party event and the nightlife event must be distinct
    // canonical events (never merged through the shared first name).
    const eventSummaries = Object.keys(story.synthesis.evidenceMap).map((eventId) => {
      const chapterEvent = story.synthesis.lifeChapters
        .flatMap((c) => c.eventIds)
        .includes(eventId);
      return { eventId, chapterEvent };
    });
    expect(eventSummaries.length).toBeGreaterThan(0);

    const partyEvent = Object.entries(story.synthesis.evidenceMap).find(([, ids]) =>
      ids.some((id) => CORPUS.find((e) => e.id === id)?.content.includes('grilled all afternoon'))
    );
    const gothEvent = Object.entries(story.synthesis.evidenceMap).find(([, ids]) =>
      ids.some((id) => CORPUS.find((e) => e.id === id)?.content.includes('goth night'))
    );
    expect(partyEvent).toBeDefined();
    expect(gothEvent).toBeDefined();
    expect(partyEvent![0]).not.toBe(gothEvent![0]);
  });

  it('marks the narrative mode as tentative when confidence is low', () => {
    if (story.mode.confidence < 0.55) {
      expect(story.mode.tentative).toBe(true);
    }
  });

  it('synthesizes actual prose with a current chapter', () => {
    expect(story.trace.qualityGateResults.final_prose_is_synthesized).toBe(true);
    expect(story.synthesis.currentChapter).toBeDefined();
    expect(story.synthesis.currentChapter!.trajectory.length).toBeGreaterThan(10);
    // Prose, not a bullet dump of raw records.
    expect(story.summary.split('\n\n').length).toBeGreaterThanOrEqual(3);
  });

  it('exposes a development trace with coverage diagnostics', () => {
    expect(story.trace.retrievedEvidenceCount).toBe(CORPUS.length);
    expect(story.trace.canonicalEventCount).toBeGreaterThan(0);
    expect(Object.keys(story.trace.domainCoverage).length).toBeGreaterThan(2);
    expect(story.trace.qualityGateResults).toHaveProperty('no_raw_transcript_leakage');
  });
});
