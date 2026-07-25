import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TimelineGeneratingSimulation } from './TimelineGeneratingSimulation';
import { buildMockGeneratedTimeline } from '../../mocks/timelineGenerationMock';
import { GeneratedTimelineReveal } from './GeneratedTimelineReveal';

describe('TimelineGeneratingSimulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders query and calls onComplete after duration', () => {
    const onComplete = vi.fn();
    const { container } = render(
      <TimelineGeneratingSimulation
        query="my nightlife"
        durationMs={100}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByTestId('timeline-generating-simulation')).toBeInTheDocument();
    expect(screen.getByText(/my nightlife/i)).toBeInTheDocument();
    expect(container.querySelector('.timeline-gen-ghost-core')).toBeInTheDocument();
    expect(container.querySelector('.timeline-gen-ghost-crown')).toBeInTheDocument();
    expect(container.querySelectorAll('.timeline-gen-ghost-spark')).toHaveLength(5);

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('buildMockGeneratedTimeline', () => {
  it('themes mock events from query keywords', () => {
    const events = buildMockGeneratedTimeline('2024 career arc');
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => /job|career|bet on yourself/i.test(e.content))).toBe(true);
  });
});

describe('GeneratedTimelineReveal', () => {
  it('shows mock badge and state change labels', () => {
    const events = buildMockGeneratedTimeline('nightlife');
    render(
      <GeneratedTimelineReveal
        query="nightlife"
        events={events}
        isMock
      />,
    );

    expect(screen.getByTestId('generated-timeline-reveal')).toBeInTheDocument();
    expect(screen.getByText(/simulated preview/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Turning point|Milestone|Inner circle|New chapter/i).length).toBeGreaterThan(0);
  });

  it('shows compiler interpretation, coverage, evidence detail, and related context', () => {
    const event = {
      id: 'event:work',
      start_time: '2026-06-24T09:00:00.000Z',
      end_time: null,
      title: 'First day in the robotics lab',
      content: 'Joined the validation team and learned the lab workflow.',
      timeline_names: ['Beginning', 'resolved event'],
      source_kind: 'resolved_event' as const,
      source_id: 'work',
      source_ids: ['work', 'work-source-2'],
      source_type: 'resolved_event',
      time_precision: 'date',
      time_confidence: 0.94,
      occurrence_status: 'confirmed' as const,
      phase: 'beginning' as const,
      subjectRelation: 'DIRECT_WORK_ACTIVITY' as const,
      relevance: 0.98,
      significance: 'high' as const,
      evidenceCount: 2,
      whyIncluded: 'Directly linked work event',
      focusedEvidence: 'Joined the validation team and learned the lab workflow.',
    };

    render(
      <GeneratedTimelineReveal
        query="My time at Vanguard Robotics"
        events={[event]}
        compilation={{
          intent: {
            rawQuery: 'My time at Vanguard Robotics',
            mode: 'EMPLOYMENT_TIMELINE',
            subjectQuery: 'Vanguard Robotics',
            perspective: 'FIRST_PERSON_EXPERIENCE',
            expectedPhases: ['prelude', 'beginning', 'active_period', 'transition', 'aftermath'],
          },
          subject: {
            entityId: '11111111-1111-4111-8111-111111111111',
            entityType: 'organization',
            displayName: 'Vanguard Robotics',
            aliases: ['Vanguard'],
            confidence: 1,
            matchKind: 'exact',
          },
          ambiguity: [],
          period: {
            start: '2026-06-24T09:00:00.000Z',
            end: '2026-07-23T09:00:00.000Z',
            label: 'Evidence range',
          },
          coverage: {
            score: 0.6,
            coveredPhases: ['beginning', 'active_period', 'transition'],
            missingPhases: ['prelude', 'aftermath'],
            isComplete: false,
          },
          sources: ['resolved_event'],
          warnings: ['Coverage is incomplete. Missing: Prelude, Aftermath.'],
          contextEvents: [{ ...event, id: 'moment:context', phase: 'related_context', subjectRelation: 'INCIDENTAL_MENTION', relevance: 0.3 }],
        }}
        contextEvents={[
          {
            ...event,
            id: 'moment:context',
            phase: 'related_context',
            subjectRelation: 'INCIDENTAL_MENTION',
            relevance: 0.3,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('timeline-interpretation')).toHaveTextContent('Employment timeline');
    expect(screen.getByText('Focused on Vanguard Robotics')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-coverage')).toHaveTextContent('60% story coverage');
    expect(screen.getAllByText('Why this belongs · 2 sources')).toHaveLength(2);
    expect(screen.getByTestId('timeline-related-context')).toBeInTheDocument();
    expect(screen.getByText(/Coverage is incomplete/i)).toBeInTheDocument();
  });
});
