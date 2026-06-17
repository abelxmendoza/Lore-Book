import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThreadSummaryBar } from './ThreadSummaryBar';

vi.mock('../hooks/useThreadSummary', () => ({
  useThreadSummary: vi.fn(),
}));

import { useThreadSummary } from '../hooks/useThreadSummary';

const mockUseThreadSummary = vi.mocked(useThreadSummary);

describe('ThreadSummaryBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseThreadSummary.mockReturnValue({
      data: {
        success: true,
        summary: {
          short: 'Discussed family in San Diego',
          medium: 'You talked about visiting Tía Maria.',
          long: 'Long recap',
          version: 1,
          messageCount: 2,
          people: ['Tía Maria'],
          places: ['San Diego'],
          themes: [],
        },
        continuity: 'People: Tía Maria',
        recallText: 'Long recap',
      },
      loading: false,
      refreshing: false,
      error: null,
      reload: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('renders summary line and recall action', () => {
    const onRecall = vi.fn();
    render(
      <ThreadSummaryBar
        threadId="thread-1"
        messageCount={2}
        onRecallInChat={onRecall}
      />
    );

    expect(screen.getByTestId('thread-summary-bar')).toBeInTheDocument();
    expect(screen.getByText(/Discussed family in San Diego/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('thread-recall-button'));
    expect(onRecall).toHaveBeenCalledWith('Recap everything we discussed in this thread.');
  });
});
