import { describe, it, expect } from 'vitest';

import { sortTimelineAnchorsChronologically } from '../../../src/services/timeline/chronologySorter';
import { hasAnchorProvenance } from '../../../src/services/timeline/timelineProvenanceService';
import {
  shouldCreateTimeBookCard,
  stitchTimelineFromMessage,
} from '../../../src/services/timeline/timelineStitchingService';
import type { TimelineAnchor } from '../../../src/services/timeline/timelineStitchingTypes';

const USER = 'user-test-001';

function stitch(text: string, extra: Parameters<typeof stitchTimelineFromMessage>[0] = {} as never) {
  return stitchTimelineFromMessage({
    text,
    sourceMessageId: 'msg-1',
    userId: USER,
    ...extra,
  });
}

function findAnchor(
  result: ReturnType<typeof stitch>,
  labelPart: string,
  phrasePart?: string,
) {
  return result.anchors.find((a) => {
    const labelOk = a.attachedToLabel?.toLowerCase().includes(labelPart.toLowerCase());
    if (!phrasePart) return labelOk;
    return labelOk && a.phrase.toLowerCase().includes(phrasePart.toLowerCase());
  });
}

describe('timeline stitching rules', () => {
  it('yesterday attaches to detention event', () => {
    const result = stitch('I got detention yesterday for talking in class.');
    const anchor = findAnchor(result, 'Detention', 'yesterday');
    expect(anchor).toBeDefined();
    expect(anchor!.attachedToType).toBe('event');
    expect(anchor!.normalizedTime?.precision).toBe('day');
  });

  it('no Time card is created for yesterday', () => {
    expect(shouldCreateTimeBookCard('yesterday')).toBe(false);
    const result = stitch('yesterday was rough.');
    expect(result.rejectedStandaloneTime.some((r) => /yesterday/i.test(r.phrase))).toBe(true);
    expect(result.anchors.every((a) => a.attachedToLabel?.toLowerCase() !== 'yesterday')).toBe(true);
  });

  it('last summer attaches to Japan Trip', () => {
    const result = stitch('We went to Japan last summer with my class.');
    const anchor = findAnchor(result, 'Japan Trip', 'last summer');
    expect(anchor).toBeDefined();
    expect(anchor!.attachedToType).toBe('event');
    expect(anchor!.normalizedTime?.precision).toBe('season');
  });

  it('every Wednesday attaches to band practice recurrence', () => {
    const result = stitch('We practiced in band every Wednesday after school.');
    const recurring = result.anchors.find(
      (a) => a.recurrence?.frequency === 'weekly' && a.recurrence.dayOfWeek === 'Wednesday',
    );
    expect(recurring).toBeDefined();
    expect(recurring!.attachedToLabel?.toLowerCase()).toMatch(/band practice|wednesday/);
    expect(recurring!.normalizedTime?.precision).toBe('recurring');
  });

  it('lunch break + yesterday group into one time window', () => {
    const result = stitch('The fight happened yesterday at lunch break in the cafeteria.');
    const anchor = result.anchors.find(
      (a) =>
        a.normalizedTime?.relativeLabel?.toLowerCase() === 'yesterday' &&
        a.normalizedTime?.schoolDayContext?.toLowerCase().includes('lunch'),
    );
    expect(anchor).toBeDefined();
    expect(anchor!.phrase.toLowerCase()).toContain('lunch');
  });

  it('middle school attaches to Bryan/school/band anchor', () => {
    const text =
      'Bryan was my best friend from middle school. We went to Whittier Christian Middle School and had Wednesday band practice.';
    const result = stitch(text);
    expect(result.stitchLinks.some((l) => /middle school/i.test(l.fromLabel))).toBe(true);
    expect(findAnchor(result, 'Bryan')).toBeDefined();
    expect(findAnchor(result, 'Whittier Christian Middle School')).toBeDefined();
    expect(
      result.anchors.some((a) => a.attachedToLabel?.toLowerCase().includes('school band')),
    ).toBe(true);
  });

  it('before covid attaches to Oscar lost-contact relationship', () => {
    const result = stitch(
      "I haven't seen Oscar since before covid — we kind of lost contact.",
    );
    const anchor = findAnchor(result, 'Oscar', 'before covid');
    expect(anchor).toBeDefined();
    expect(anchor!.attachedToType).toBe('relationship_arc');
    expect(anchor!.normalizedTime?.precision).toBe('fuzzy');
  });

  it('since July + 3 months attaches to kickboxing skill', () => {
    const result = stitch('I have been learning kickboxing since July for 3 months.');
    const anchor = findAnchor(result, 'Kickboxing');
    expect(anchor).toBeDefined();
    expect(anchor!.attachedToType).toBe('skill');
    expect(anchor!.normalizedTime?.startHint?.toLowerCase()).toBe('july');
    expect(anchor!.normalizedTime?.durationHint).toMatch(/3\s+months/i);
  });

  it('work era phrases attach to work history', () => {
    const vanguard = stitch('I worked at Vanguard Robotics during college.');
    expect(
      vanguard.anchors.some((a) => a.attachedToLabel?.includes('Vanguard Robotics')),
    ).toBe(true);

    const amazon = stitch('I started Amazon in July and onboarded with the team.');
    expect(amazon.anchors.some((a) => /amazon/i.test(a.attachedToLabel ?? ''))).toBe(true);
  });

  it('fuzzy times preserve fuzzy precision', () => {
    const summer = stitch('We went to Japan last summer.');
    const summerAnchor = findAnchor(summer, 'Japan Trip', 'last summer');
    expect(summerAnchor!.normalizedTime?.precision).toBe('season');
    expect(summerAnchor!.normalizedTime?.date).toBeUndefined();

    const covid = stitch("Haven't talked since before covid.");
    const covidAnchor = covid.anchors.find((a) => /covid/i.test(a.phrase));
    expect(covidAnchor!.normalizedTime?.precision).toBe('fuzzy');
    expect(covidAnchor!.normalizedTime?.date).toBeUndefined();
  });

  it('timeline contradictions create review items', () => {
    const existing = [
      {
        id: 'ta-existing',
        phrase: 'started Amazon in July',
        attachedToLabel: 'Amazon Era',
        attachedToType: 'work_period' as const,
        normalizedTime: { precision: 'month' as const, startHint: 'july' },
      },
    ];
    const result = stitch('I started Amazon in May.', {
      attachmentCandidates: [
        { attachedToType: 'work_period', attachedToLabel: 'Amazon Era', confidence: 0.9 },
      ],
    });
    const mayAnchor = result.anchors.find((a) => /may/i.test(a.phrase));
    expect(mayAnchor).toBeDefined();

    const withExisting = stitchTimelineFromMessage(
      {
        text: 'I started Amazon in May.',
        sourceMessageId: 'msg-2',
        userId: USER,
        attachmentCandidates: [
          { attachedToType: 'work_period', attachedToLabel: 'Amazon Era', confidence: 0.9 },
        ],
      },
      existing,
    );
    expect(withExisting.contradictions.length).toBeGreaterThan(0);
    const reviewed = withExisting.anchors.find((a) => /may/i.test(a.phrase));
    expect(reviewed?.requiresReview).toBe(true);
  });

  it('chronology sorter orders exact/fuzzy/era entries', () => {
    const anchors: TimelineAnchor[] = [
      {
        id: '1',
        userId: USER,
        attachedToType: 'event',
        attachedToLabel: 'Exact',
        phrase: '2020-01-15',
        normalizedTime: { precision: 'exact', date: '2020-01-15T12:00:00.000Z' },
        confidence: 1,
        evidencePhrase: 'on Jan 15 2020',
        sourceMessageId: 'm1',
        inferredNotConfirmed: false,
        requiresReview: false,
      },
      {
        id: '2',
        userId: USER,
        attachedToType: 'narrative_anchor',
        attachedToLabel: 'Middle School Era',
        phrase: 'middle school',
        normalizedTime: { precision: 'era', eraLabel: 'middle school' },
        confidence: 0.8,
        evidencePhrase: 'middle school years',
        sourceMessageId: 'm2',
        inferredNotConfirmed: true,
        requiresReview: false,
      },
      {
        id: '3',
        userId: USER,
        attachedToType: 'relationship_arc',
        attachedToLabel: 'Oscar',
        phrase: 'before covid',
        normalizedTime: { precision: 'fuzzy', relativeLabel: 'before covid' },
        confidence: 0.7,
        evidencePhrase: 'before covid',
        sourceMessageId: 'm3',
        inferredNotConfirmed: true,
        requiresReview: false,
      },
    ];

    const sorted = sortTimelineAnchorsChronologically(anchors, {
      m3: '2024-06-01T00:00:00.000Z',
    });
    expect(sorted[0].normalizedTime?.precision).toBe('exact');
    expect(sorted[1].normalizedTime?.precision).toBe('era');
    expect(sorted[2].normalizedTime?.precision).toBe('fuzzy');
  });

  it('timeline anchors include provenance', () => {
    const result = stitch('I got detention yesterday.');
    expect(result.anchors.length).toBeGreaterThan(0);
    for (const anchor of result.anchors) {
      expect(hasAnchorProvenance(anchor)).toBe(true);
      expect(anchor.sourceMessageId).toBe('msg-1');
      expect(anchor.evidencePhrase.length).toBeGreaterThan(0);
    }
  });
});
