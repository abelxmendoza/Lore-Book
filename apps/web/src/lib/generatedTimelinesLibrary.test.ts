import { describe, it, expect } from 'vitest';
import {
  findTimelineByQuery,
  normalizeTimelineQueryKey,
  removeGeneratedTimeline,
  upsertGeneratedTimeline,
} from './generatedTimelinesLibrary';

describe('generatedTimelinesLibrary', () => {
  it('normalizes query keys for lookup', () => {
    expect(normalizeTimelineQueryKey('  My Nightlife  ')).toBe('my nightlife');
    expect(findTimelineByQuery([], 'my nightlife')).toBeUndefined();
  });

  it('upserts and finds by query', () => {
    const { library, saved } = upsertGeneratedTimeline([], {
      query: '2024 career',
      isMock: true,
      events: [
        { id: '1', start_time: '2024-01-01', content: 'Started new role' },
      ],
    });

    expect(library).toHaveLength(1);
    expect(saved.query).toBe('2024 career');
    expect(findTimelineByQuery(library, '2024 career')?.id).toBe(saved.id);

    const again = upsertGeneratedTimeline(library, {
      query: '2024 career',
      isMock: false,
      events: [
        { id: '2', start_time: '2024-06-01', content: 'Promotion' },
      ],
      existingId: saved.id,
    });
    expect(again.library).toHaveLength(1);
    expect(again.saved.events).toHaveLength(1);
    expect(again.saved.isMock).toBe(false);
  });

  it('removes timelines by id', () => {
    const { library, saved } = upsertGeneratedTimeline([], {
      query: 'family',
      isMock: true,
      events: [{ id: 'a', start_time: '2020-01-01', content: 'Trip' }],
    });
    expect(removeGeneratedTimeline(library, saved.id)).toHaveLength(0);
  });

  it('preserves compiler provenance when saving a generated timeline', () => {
    const { saved } = upsertGeneratedTimeline([], {
      query: 'My time at Vanguard Robotics',
      isMock: false,
      events: [
        {
          id: 'event:work',
          start_time: '2026-06-24T09:00:00.000Z',
          title: 'First day',
          content: 'Joined the lab.',
          timeline_names: ['Beginning'],
          source_kind: 'resolved_event',
          source_id: 'work',
          source_ids: ['work'],
          source_type: 'resolved_event',
          time_precision: 'date',
          time_confidence: 0.95,
          phase: 'beginning',
          subjectRelation: 'DIRECT_WORK_ACTIVITY',
          relevance: 0.98,
          significance: 'high',
          evidenceCount: 1,
          whyIncluded: 'Directly linked work event',
          focusedEvidence: 'Joined the lab.',
        },
      ],
      compilation: {
        intent: {
          rawQuery: 'My time at Vanguard Robotics',
          mode: 'EMPLOYMENT_TIMELINE',
          subjectQuery: 'Vanguard Robotics',
          perspective: 'FIRST_PERSON_EXPERIENCE',
          expectedPhases: ['beginning', 'active_period', 'transition'],
        },
        subject: {
          entityId: '11111111-1111-4111-8111-111111111111',
          entityType: 'organization',
          displayName: 'Vanguard Robotics',
          aliases: [],
          confidence: 1,
        },
        ambiguity: [],
        period: null,
        coverage: {
          score: 0.33,
          coveredPhases: ['beginning'],
          missingPhases: ['active_period', 'transition'],
          isComplete: false,
        },
        sources: ['resolved_event'],
        warnings: [],
        contextEvents: [],
      },
    });

    expect(saved.events[0]).toMatchObject({
      source_id: 'work',
      phase: 'beginning',
      whyIncluded: 'Directly linked work event',
    });
    expect(saved.compilation?.subject?.displayName).toBe('Vanguard Robotics');
  });
});
