import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatSourcesBar } from './ChatSourcesBar';

describe('ChatSourcesBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('separates supporting sources from consulted background and copies both', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ChatSourcesBar
        sources={[
          {
            type: 'character',
            id: 'c1',
            title: 'Marcus',
            snippet: 'Friend from the show',
            relevanceScore: 88,
            usage: 'supporting',
          },
          {
            type: 'entry',
            id: 'e1',
            title: 'Recorded a demo after the show',
            relevanceScore: 70,
            usage: 'background',
          },
        ]}
      />,
    );

    expect(screen.getByText('Sources for this answer')).toBeInTheDocument();
    expect(screen.getByText('Sources supporting this answer')).toBeInTheDocument();
    expect(screen.getByText('Consulted background: 1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chat-sources-copy-all'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = String(writeText.mock.calls[0]?.[0] ?? '');
    expect(payload).toContain('Marcus');
    expect(payload).toContain('Recorded a demo after the show');
    expect(payload).toContain('Usage: supporting');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('collapses and expands the source list', () => {
    render(
      <ChatSourcesBar
        sources={[
          { type: 'character', id: 'c1', title: 'Marcus', usage: 'supporting' },
        ]}
      />,
    );

    const toggle = screen.getByTestId('chat-sources-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Sources supporting this answer')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Sources supporting this answer')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Sources supporting this answer')).toBeInTheDocument();
  });
});
