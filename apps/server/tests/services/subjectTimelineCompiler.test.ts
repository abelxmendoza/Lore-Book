import { describe, expect, it } from 'vitest';

import {
  chooseResolvedSubject,
  compileSubjectTimeline,
  extractFocusedEvidence,
  interpretSubjectTimelineQuery,
} from '../../src/services/timeline/subjectTimelineCompiler';
import type { StitchedTimelineItem } from '../../src/services/chronologyV2/stitchedTimelineService';

function item(overrides: Partial<StitchedTimelineItem>): StitchedTimelineItem {
  return {
    id: 'event:default',
    kind: 'event',
    sourceId: 'default',
    sortTime: '2026-06-24T09:00:00.000Z',
    userSortIndex: null,
    title: 'Timeline event',
    body: '',
    sourceKind: 'resolved_event',
    sourceIds: ['default'],
    sourceType: 'resolved_event',
    timePrecision: 'date',
    timeConfidence: 0.9,
    ...overrides,
  };
}

describe('subject timeline compiler', () => {
  it('interprets employment generation separately from evidence search', () => {
    expect(interpretSubjectTimelineQuery('My time at Vanguard Robotics')).toMatchObject({
      mode: 'EMPLOYMENT_TIMELINE',
      subjectQuery: 'Vanguard Robotics',
      perspective: 'FIRST_PERSON_EXPERIENCE',
    });
    expect(interpretSubjectTimelineQuery('Show every journal mentioning Vanguard Robotics')).toMatchObject({
      mode: 'EVIDENCE_SEARCH',
      subjectQuery: 'Vanguard Robotics',
    });
  });

  it('extracts subjects from conversational timeline phrasing', () => {
    expect(interpretSubjectTimelineQuery('How did MemoVault develop over time?').subjectQuery)
      .toBe('MemoVault');
    expect(
      interpretSubjectTimelineQuery('What happened during my time in the Harbor scene?').subjectQuery,
    ).toBe('the Harbor scene');
  });

  it('requires clarification for similarly scored fuzzy subjects', () => {
    const choice = chooseResolvedSubject([
      {
        entityId: '11111111-1111-4111-8111-111111111111',
        entityType: 'organization',
        displayName: 'Vanguard Robotics',
        aliases: [],
        knownStatus: 'known',
        confidence: 0.81,
        source: 'organizations',
        matchKind: 'fuzzy',
      },
      {
        entityId: '22222222-2222-4222-8222-222222222222',
        entityType: 'organization',
        displayName: 'Vanguard Research',
        aliases: [],
        knownStatus: 'known',
        confidence: 0.78,
        source: 'organizations',
        matchKind: 'fuzzy',
      },
    ]);
    expect(choice.subject).toBeNull();
    expect(choice.ambiguity).toHaveLength(2);
  });

  it('extracts only the subject-bearing span from a mixed journal', () => {
    const focused = extractFocusedEvidence(
      'Jamie hosted a graduation party. We talked for hours. I start at Vanguard Robotics next week. I am excited to join the lab. Then I drove home.',
      ['vanguard', 'robotics'],
    );
    expect(focused).toContain('I start at Vanguard Robotics next week.');
    expect(focused).toContain('I am excited to join the lab.');
    expect(focused).not.toContain('graduation party');
  });

  it('ranks direct work above an incidental product mention and reports coverage gaps', () => {
    const intent = interpretSubjectTimelineQuery('My time at Vanguard Robotics');
    const compilation = compileSubjectTimeline({
      query: intent.rawQuery,
      intent,
      subject: {
        entityId: '11111111-1111-4111-8111-111111111111',
        entityType: 'organization',
        displayName: 'Vanguard Robotics',
        aliases: ['Vanguard'],
        confidence: 1,
        matchKind: 'exact',
      },
      directSourceIds: new Set(['work-event']),
      items: [
        item({
          id: 'event:work',
          sourceId: 'work-event',
          sourceIds: ['work-event'],
          title: 'Investigated a sensor failure',
          body: 'Worked in the lab and reproduced the failure.',
          sortTime: '2026-07-10T09:00:00.000Z',
        }),
        item({
          id: 'moment:product',
          sourceId: 'product-memory',
          sourceIds: ['product-memory'],
          sourceKind: 'journal_entry',
          title: 'Graduation party',
          body: 'I noticed a Vanguard Robotics toy at the party.',
          sortTime: '2026-06-10T09:00:00.000Z',
        }),
      ],
    });

    expect(compilation.events).toHaveLength(1);
    expect(compilation.events[0]).toMatchObject({
      source_id: 'work-event',
      subjectRelation: 'DIRECT_WORK_ACTIVITY',
    });
    expect(compilation.contextEvents).toHaveLength(1);
    expect(compilation.contextEvents[0]?.subjectRelation).toBe('INCIDENTAL_MENTION');
    expect(compilation.coverage.missingPhases).toContain('transition');
  });

  it('retrieves a keyword-free event through a canonical source link', () => {
    const intent = interpretSubjectTimelineQuery('My time at Vanguard Robotics');
    const compilation = compileSubjectTimeline({
      query: intent.rawQuery,
      intent,
      subject: {
        entityId: '11111111-1111-4111-8111-111111111111',
        entityType: 'organization',
        displayName: 'Vanguard Robotics',
        aliases: [],
        confidence: 1,
      },
      directSourceIds: new Set(['linked-event']),
      items: [
        item({
          id: 'event:linked',
          sourceId: 'linked-event',
          sourceIds: ['linked-event'],
          title: 'Reproduced the memory-pool error',
          body: 'The lab test isolated a queue failure.',
        }),
      ],
    });
    expect(compilation.events[0]?.source_id).toBe('linked-event');
    expect(compilation.events[0]?.relevance).toBeGreaterThan(0.9);
  });

  it('scopes a generic career timeline to career-domain events only', () => {
    const intent = interpretSubjectTimelineQuery('Build my career timeline');
    const compilation = compileSubjectTimeline({
      query: intent.rawQuery,
      intent,
      subject: null,
      items: [
        item({
          id: 'event:job',
          sourceId: 'job',
          title: 'Joined Vanguard Robotics',
          body: 'I started a robotics engineering role in the lab.',
          sortTime: '2025-04-01T09:00:00.000Z',
        }),
        item({
          id: 'event:relationship',
          sourceId: 'relationship',
          title: 'Dinner with Jamie',
          body: 'We talked about our relationship over dinner.',
          sortTime: '2025-03-01T09:00:00.000Z',
        }),
        item({
          id: 'event:shopping',
          sourceId: 'shopping',
          title: 'Shopping trip',
          body: 'I bought groceries at Northwind Market.',
          sortTime: '2025-02-01T09:00:00.000Z',
        }),
      ],
    });

    expect(intent.mode).toBe('EMPLOYMENT_TIMELINE');
    expect(compilation.events.map((event) => event.source_id)).toEqual(['job']);
    expect(compilation.contextEvents).toHaveLength(0);
  });

  it('labels organization subject inclusion from attributions, not name overlap', () => {
    const intent = interpretSubjectTimelineQuery('Acme');
    const compilation = compileSubjectTimeline({
      query: intent.rawQuery,
      intent,
      subject: {
        entityId: 'org-acme',
        entityType: 'organization',
        displayName: 'Acme',
        aliases: [],
        confidence: 1,
      },
      items: [
        item({
          id: 'event:work',
          sourceId: 'evt-work',
          title: 'Started the job',
          body: 'First week in the lab.',
          organizationAttributions: [{
            organizationId: 'org-acme',
            organizationName: 'Acme',
            role: 'employer',
            evidence: 'I started working at Acme',
            evidenceKind: 'explicit_work_phrase',
            confidence: 0.93,
            accepted: true,
            canonical: true,
            acceptedForOrganizationTimeline: true,
            direct: true,
            whyIncluded: 'Explicit work/employer context',
            protagonistRelation: true,
            unresolved: false,
          }],
        }),
        item({
          id: 'event:thought',
          sourceId: 'evt-thought',
          title: 'Thinking about Acme',
          body: 'I was thinking about Acme.',
          organizationAttributions: [{
            organizationId: 'org-acme',
            organizationName: 'Acme',
            role: 'referenced',
            evidence: 'thinking about Acme',
            evidenceKind: 'reference_phrase',
            confidence: 0.82,
            accepted: true,
            canonical: true,
            acceptedForOrganizationTimeline: false,
            direct: true,
            whyIncluded: 'Referenced only — not organization participation',
            protagonistRelation: false,
            unresolved: false,
          }],
        }),
      ],
    });

    const work = [...compilation.events, ...compilation.contextEvents].find((row) => row.source_id === 'evt-work');
    const thought = [...compilation.events, ...compilation.contextEvents].find((row) => row.source_id === 'evt-thought');
    expect(work?.subjectRelation).toBe('DIRECT_EVENT');
    expect(work?.whyIncluded).toBe('Explicit work/employer context');
    expect(thought?.subjectRelation).toBe('INCIDENTAL_MENTION');
    expect(thought?.whyIncluded).toMatch(/Referenced only/);
  });
});
