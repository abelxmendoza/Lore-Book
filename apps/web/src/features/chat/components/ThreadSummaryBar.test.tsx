import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getDisplaySummary, ThreadSummaryBar } from './ThreadSummaryBar';

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
    expect(screen.getByTestId('thread-summary-full-text')).toHaveTextContent('Long recap');
    fireEvent.click(screen.getByTestId('thread-recall-button'));
    expect(onRecall).toHaveBeenCalledWith('Recap everything we discussed in this thread.');
  });

  it('uses one clean display summary when short duplicates medium', () => {
    expect(getDisplaySummary({
      short: 'Discussed Mara and Renna.',
      medium: 'Discussed Mara and Renna. You also clarified that Cyberpunk was a game mention, not a person.',
      long: 'Long recap',
      version: 1,
      messageCount: 4,
      people: ['Mara', 'Renna'],
      places: [],
      themes: ['character cleanup'],
    })).toBe('Discussed Mara and Renna. You also clarified that Cyberpunk was a game mention, not a person.');
  });

  it('uses the long recap when the summary is fully expanded', () => {
    expect(getDisplaySummary({
      short: 'Discussed Mara and Renna.',
      medium: 'Discussed Mara and Renna. You also clarified that Cyberpunk was a game mention, not a person.',
      long: 'Long recap with every beat of the Mara and Renna conversation.',
      version: 1,
      messageCount: 4,
      people: ['Mara', 'Renna'],
      places: [],
      themes: ['character cleanup'],
    }, false, { full: true })).toBe('Long recap with every beat of the Mara and Renna conversation.');
  });

  it('collapses to a one-line peek and expands to the full unclamped summary', () => {
    mockUseThreadSummary.mockReturnValue({
      data: {
        success: true,
        summary: {
          short: 'Short recap',
          medium: 'Medium recap about Tía Maria.',
          long: 'You talked about visiting Tía Maria in San Diego and catching up on family news.',
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

    render(
      <ThreadSummaryBar
        threadId="thread-1"
        messageCount={2}
        isMobile
      />,
    );

    expect(screen.getByTestId('thread-summary-bar')).toHaveAttribute('data-expanded', 'false');
    expect(screen.getByTestId('thread-summary-expand')).toBeInTheDocument();
    expect(screen.queryByText('People')).not.toBeInTheDocument();
    expect(screen.queryByTestId('thread-summary-full-text')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('thread-summary-expand'));

    expect(screen.getByTestId('thread-summary-bar')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('thread-summary-full-text')).toHaveTextContent(
      'You talked about visiting Tía Maria in San Diego and catching up on family news.',
    );
    expect(screen.getByText('Tía Maria')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('thread-summary-collapse'));
    expect(screen.getByTestId('thread-summary-bar')).toHaveAttribute('data-expanded', 'false');
  });

  it('uses durable message entities when summary entity extraction lagged', () => {
    mockUseThreadSummary.mockReturnValue({
      data: {
        success: true,
        summary: {
          short: '4 messages in this thread.',
          medium: '4 messages in this thread.',
          long: '4 messages in this thread.',
          version: 1,
          messageCount: 4,
          people: [],
          places: [],
          themes: [],
        },
        continuity: '',
        recallText: '4 messages in this thread.',
      },
      loading: false,
      refreshing: false,
      error: null,
      reload: vi.fn(),
      refresh: vi.fn(),
    });

    render(
      <ThreadSummaryBar
        threadId="thread-1"
        messageCount={4}
        confirmedEntities={[
          { name: 'Marcus', type: 'character' },
          { name: 'Northwind Gym', type: 'location' },
        ]}
      />,
    );

    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByText('Northwind Gym')).toBeInTheDocument();
  });
});
