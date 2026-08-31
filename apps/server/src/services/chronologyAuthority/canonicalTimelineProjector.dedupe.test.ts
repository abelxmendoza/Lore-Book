import { describe, expect, it } from 'vitest';
import { projectCanonicalTimeline, type ProjectableTimelineItem } from './canonicalTimelineProjector';

function baseItem(overrides: Partial<ProjectableTimelineItem> & Pick<ProjectableTimelineItem, 'id' | 'sourceId' | 'sourceKind' | 'sortTime' | 'title' | 'body'>): ProjectableTimelineItem {
  return {
    kind: 'moment',
    sourceIds: [overrides.sourceId],
    sourceType: 'manual',
    tags: [],
    confidence: 0.9,
    timePrecision: 'exact',
    timeConfidence: 0.9,
    temporalSource: 'user_stated',
    occurredAt: overrides.sortTime,
    mentionedAt: null,
    recordedAt: overrides.sortTime,
    knownFrom: overrides.sortTime,
    validFrom: null,
    validUntil: null,
    metadata: null,
    ...overrides,
  };
}

describe('projectCanonicalTimeline — journal/resolved_event dedupe', () => {
  it('collapses a journal moment under a resolved event on the same day with a genuinely matching title', () => {
    const items: ProjectableTimelineItem[] = [
      baseItem({
        id: 'event-1', sourceId: 'event-1', sourceKind: 'resolved_event', kind: 'event',
        sortTime: '2026-06-01T18:00:00Z', title: 'Dinner with Marcus', body: 'Had dinner with Marcus downtown.',
      }),
      baseItem({
        id: 'journal-1', sourceId: 'journal-1', sourceKind: 'journal_entry',
        sortTime: '2026-06-01T20:00:00Z', title: 'Dinner with Marcus', body: 'Went to dinner with Marcus tonight.',
      }),
    ];
    const { canonical, evidenceHidden } = projectCanonicalTimeline(items);
    expect(evidenceHidden).toBe(1);
    expect(canonical.filter((i) => i.sourceKind === 'journal_entry')).toHaveLength(0);
    expect(canonical.filter((i) => i.sourceKind === 'resolved_event')).toHaveLength(1);
  });

  it('does NOT collapse two distinct same-day events that merely share one common word (two separate gym visits)', () => {
    const items: ProjectableTimelineItem[] = [
      baseItem({
        id: 'event-gym-marcus', sourceId: 'event-gym-marcus', sourceKind: 'resolved_event', kind: 'event',
        sortTime: '2026-06-01T09:00:00Z', title: 'Gym session with Marcus', body: 'Lifted weights with Marcus in the morning.',
      }),
      baseItem({
        id: 'journal-gym-priya', sourceId: 'journal-gym-priya', sourceKind: 'journal_entry',
        sortTime: '2026-06-01T19:00:00Z', title: 'Evening gym session', body: 'Went back to the gym in the evening with Priya, totally different session.',
      }),
    ];
    const { canonical, evidenceHidden } = projectCanonicalTimeline(items);
    // Both must survive as distinct occurrences — a single shared token
    // ("session") is not enough evidence they're the same real-world event.
    expect(evidenceHidden).toBe(0);
    expect(canonical).toHaveLength(2);
  });

  it('collapses when the journal entry title exactly matches the event title, even with different body wording', () => {
    const items: ProjectableTimelineItem[] = [
      baseItem({
        id: 'event-grad', sourceId: 'event-grad', sourceKind: 'resolved_event', kind: 'event',
        sortTime: '2026-05-15T14:00:00Z', title: 'Graduation ceremony', body: 'Walked across the stage.',
      }),
      baseItem({
        id: 'journal-grad', sourceId: 'journal-grad', sourceKind: 'journal_entry',
        sortTime: '2026-05-15T22:00:00Z', title: 'Graduation ceremony', body: 'Cannot believe it is finally over, feeling so many things right now.',
      }),
    ];
    const { canonical, evidenceHidden } = projectCanonicalTimeline(items);
    expect(evidenceHidden).toBe(1);
    expect(canonical).toHaveLength(1);
    expect(canonical[0].sourceKind).toBe('resolved_event');
  });

  it('a stable shared-source id always wins and skips the text heuristic entirely', () => {
    const items: ProjectableTimelineItem[] = [
      baseItem({
        id: 'event-1', sourceId: 'event-1', sourceKind: 'resolved_event', kind: 'event',
        sortTime: '2026-06-01T18:00:00Z', title: 'Completely different wording here',
        body: 'No shared vocabulary with the journal entry at all whatsoever.',
        sourceIds: ['event-1', 'journal-linked'],
      }),
      baseItem({
        id: 'journal-linked', sourceId: 'journal-linked', sourceKind: 'journal_entry',
        sortTime: '2026-06-01T20:00:00Z', title: 'Another unrelated phrase entirely',
        body: 'Also nothing in common textually, but the same underlying source id.',
      }),
    ];
    const { canonical, evidenceHidden } = projectCanonicalTimeline(items);
    expect(evidenceHidden).toBe(1);
    expect(canonical).toHaveLength(1);
  });

  it('does not collapse two events on different days even with identical titles', () => {
    const items: ProjectableTimelineItem[] = [
      baseItem({
        id: 'event-a', sourceId: 'event-a', sourceKind: 'resolved_event', kind: 'event',
        sortTime: '2026-06-01T18:00:00Z', title: 'Weekly team dinner', body: 'The usual crew.',
      }),
      baseItem({
        id: 'journal-b', sourceId: 'journal-b', sourceKind: 'journal_entry',
        sortTime: '2026-06-08T18:00:00Z', title: 'Weekly team dinner', body: 'The usual crew, different week.',
      }),
    ];
    const { canonical, evidenceHidden } = projectCanonicalTimeline(items);
    expect(evidenceHidden).toBe(0);
    expect(canonical).toHaveLength(2);
  });

  it('routes pending imported events to unresolved without hiding them as canon', () => {
    const pending = baseItem({
      id: 'pending-resume', sourceId: 'pending-resume', sourceKind: 'journal_entry',
      sortTime: '2026-06-10T12:00:00Z', title: 'Pending resume role', body: 'Worked at a company.',
      metadata: { source_type: 'resume', review_required: true, review_state: 'pending' },
    });
    const confirmed = baseItem({
      id: 'confirmed-resume', sourceId: 'confirmed-resume', sourceKind: 'journal_entry',
      sortTime: '2026-06-11T12:00:00Z', title: 'Confirmed resume role', body: 'Worked at a company.',
      metadata: { source_type: 'resume', review_required: true, review_state: 'user_confirmed' },
    });

    const result = projectCanonicalTimeline([pending, confirmed]);

    expect(result.canonical.map((item) => item.id)).toEqual(['confirmed-resume']);
    expect(result.unresolved.map((item) => item.id)).toEqual(['pending-resume']);
  });
});
