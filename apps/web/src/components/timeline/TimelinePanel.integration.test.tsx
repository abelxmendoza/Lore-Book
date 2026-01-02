import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { TimelinePanel } from '../TimelinePanel';
import type { TimelineResponse } from '../../hooks/useLoreKeeper';

// Mock the timeline data - matches TimelineResponse structure
const mockTimelineWithData: TimelineResponse = {
  chapters: [
    {
      id: 'chapter-1',
      title: 'Test Chapter',
      months: [
        {
          month: 'January 2024',
          entries: [
            {
              id: 'entry-1',
              content: 'Test timeline entry',
              date: new Date().toISOString(),
              tags: [],
              source: 'manual'
            }
          ]
        }
      ]
    }
  ],
  unassigned: []
};

const mockEmptyTimeline: TimelineResponse = {
  chapters: [],
  unassigned: []
};

describe('TimelinePanel Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render timeline panel with data', () => {
    render(
      <BrowserRouter>
        <TimelinePanel timeline={mockTimelineWithData} />
      </BrowserRouter>
    );

    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Test Chapter')).toBeInTheDocument();
    expect(screen.getByText('Test timeline entry')).toBeInTheDocument();
  });

  it('should handle empty timeline', () => {
    render(
      <BrowserRouter>
        <TimelinePanel timeline={mockEmptyTimeline} />
      </BrowserRouter>
    );

    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.queryByText('Test timeline entry')).not.toBeInTheDocument();
  });

  it('should render unassigned entries', () => {
    const timelineWithUnassigned: TimelineResponse = {
      chapters: [],
      unassigned: [
        {
          month: 'January 2024',
          entries: [
            {
              id: 'entry-2',
              content: 'Unassigned entry',
              date: new Date().toISOString(),
              tags: [],
              source: 'manual'
            }
          ]
        }
      ]
    };

    render(
      <BrowserRouter>
        <TimelinePanel timeline={timelineWithUnassigned} />
      </BrowserRouter>
    );

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('Unassigned entry')).toBeInTheDocument();
  });
});
