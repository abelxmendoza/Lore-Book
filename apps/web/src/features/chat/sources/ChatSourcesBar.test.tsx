import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatSourcesBar } from './ChatSourcesBar';

describe('ChatSourcesBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a compact source disclosure and copies user-facing details', async () => {
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

    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.queryByText('Sources supporting this answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Consulted background: 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chat-sources-toggle'));
    expect(screen.getByText('Recorded a demo after the show')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chat-sources-copy-all'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = String(writeText.mock.calls[0]?.[0] ?? '');
    expect(payload).toContain('Marcus');
    expect(payload).toContain('Recorded a demo after the show');
    expect(payload).not.toContain('Usage:');
    expect(payload).not.toContain('Relevance:');
    expect(payload).not.toContain('Id:');
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
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Marcus')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Marcus')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Marcus')).not.toBeInTheDocument();
  });
});
