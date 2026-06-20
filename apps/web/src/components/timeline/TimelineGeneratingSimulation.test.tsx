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
});
