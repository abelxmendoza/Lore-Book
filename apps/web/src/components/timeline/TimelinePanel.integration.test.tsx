import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { TimelinePanel } from './TimelinePanel';

// Mock the timeline data
const mockTimeline = [
  {
    id: '1',
    content: 'Test timeline entry',
    timestamp: new Date().toISOString(),
    tags: [],
  },
];

describe('TimelinePanel Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render timeline panel', async () => {
    render(
      <BrowserRouter>
        <TimelinePanel timeline={mockTimeline} loading={false} />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Test timeline entry')).toBeInTheDocument();
    });
  });

  it('should display loading state', () => {
    render(
      <BrowserRouter>
        <TimelinePanel timeline={[]} loading={true} />
      </BrowserRouter>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should handle empty timeline', () => {
    render(
      <BrowserRouter>
        <TimelinePanel timeline={[]} loading={false} />
      </BrowserRouter>
    );

    expect(screen.queryByText('Test timeline entry')).not.toBeInTheDocument();
  });
});
