import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatChangedSinceLastTime } from './WhatChangedSinceLastTime';
import type { ChatThread } from '../hooks/useChatThreads';

const mockFetchWhatChanged = vi.fn();
vi.mock('../../../api/whatChanged', () => ({
  fetchWhatChanged: (...args: unknown[]) => mockFetchWhatChanged(...args),
}));

vi.mock('../../../lib/monitoring', () => ({
  analytics: { track: vi.fn(), page: vi.fn() },
  performance: { mark: vi.fn(), measure: vi.fn(), trackApiCall: vi.fn(), now: () => Date.now() },
  errorTracking: { captureException: vi.fn() },
}));

// Build a thread that qualifies for the "what changed" surface:
// - gap between 20h and 60 days
// - at least 3 messages
function makeThread(overrides: Partial<ChatThread> = {}): ChatThread {
  const updatedAt = new Date(Date.now() - 26 * 3_600_000).toISOString(); // 26h ago
  return {
    id: 'thread-1',
    title: 'Test Thread',
    updatedAt,
    createdAt: updatedAt,
    messages: [
      { id: 'm1', role: 'user', content: 'Hello', createdAt: updatedAt },
      { id: 'm2', role: 'assistant', content: 'Hi', createdAt: updatedAt },
      { id: 'm3', role: 'user', content: 'Great', createdAt: updatedAt },
    ],
    ...overrides,
  } as ChatThread;
}

describe('WhatChangedSinceLastTime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWhatChanged.mockResolvedValue({
      summary: { hasChanges: true, gapDays: 1.1 },
      lines: ['You started a new project', 'Met Sarah for coffee'],
    });
  });

  it('renders nothing when thread is null', () => {
    const { container } = render(<WhatChangedSinceLastTime thread={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when thread is undefined', () => {
    const { container } = render(<WhatChangedSinceLastTime thread={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when gap is too small (< 20h)', async () => {
    const thread = makeThread({
      updatedAt: new Date(Date.now() - 10 * 3_600_000).toISOString(), // 10h ago
    });
    const { container } = render(<WhatChangedSinceLastTime thread={thread} />);
    // Give it time to potentially show
    await new Promise(r => setTimeout(r, 50));
    expect(container.firstChild).toBeNull();
    expect(mockFetchWhatChanged).not.toHaveBeenCalled();
  });

  it('renders nothing when gap is too large (> 60 days)', async () => {
    const thread = makeThread({
      updatedAt: new Date(Date.now() - 70 * 24 * 3_600_000).toISOString(),
    });
    const { container } = render(<WhatChangedSinceLastTime thread={thread} />);
    await new Promise(r => setTimeout(r, 50));
    expect(container.firstChild).toBeNull();
    expect(mockFetchWhatChanged).not.toHaveBeenCalled();
  });

  it('renders nothing when thread has fewer than 3 messages', async () => {
    const thread = makeThread({
      messages: [
        { id: 'm1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() },
        { id: 'm2', role: 'assistant', content: 'Hello', createdAt: new Date().toISOString() },
      ] as any,
    });
    const { container } = render(<WhatChangedSinceLastTime thread={thread} />);
    await new Promise(r => setTimeout(r, 50));
    expect(container.firstChild).toBeNull();
    expect(mockFetchWhatChanged).not.toHaveBeenCalled();
  });

  it('renders nothing when server says no changes', async () => {
    mockFetchWhatChanged.mockResolvedValue({
      summary: { hasChanges: false, gapDays: 1 },
      lines: [],
    });
    const thread = makeThread();
    const { container } = render(<WhatChangedSinceLastTime thread={thread} />);
    await waitFor(() => {
      expect(mockFetchWhatChanged).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });

  it('shows the card with changed lines when conditions are met', async () => {
    const thread = makeThread();
    render(<WhatChangedSinceLastTime thread={thread} />);

    await waitFor(() => {
      expect(screen.getByText('You started a new project')).toBeInTheDocument();
      expect(screen.getByText('Met Sarah for coffee')).toBeInTheDocument();
    });
  });

  it('shows "since yesterday" for 1-1.5 day gap', async () => {
    const thread = makeThread();
    render(<WhatChangedSinceLastTime thread={thread} />);

    await waitFor(() => {
      expect(screen.getByText(/since yesterday/i)).toBeInTheDocument();
    });
  });

  it('shows multi-day label for 2+ day gap', async () => {
    mockFetchWhatChanged.mockResolvedValue({
      summary: { hasChanges: true, gapDays: 5 },
      lines: ['Big changes happened'],
    });
    const thread = makeThread({
      updatedAt: new Date(Date.now() - 5 * 24 * 3_600_000).toISOString(),
    });
    render(<WhatChangedSinceLastTime thread={thread} />);

    await waitFor(() => {
      expect(screen.getByText(/over the last 5 days/i)).toBeInTheDocument();
    });
  });

  it('can be dismissed — card disappears', async () => {
    const thread = makeThread();
    render(<WhatChangedSinceLastTime thread={thread} />);

    await waitFor(() => {
      expect(screen.getByText('You started a new project')).toBeInTheDocument();
    });

    // Find and click the dismiss button (the X icon button)
    const dismissBtn = screen.getByRole('button');
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByText('You started a new project')).not.toBeInTheDocument();
    });
  });

  it('only fires once per thread id — does not refetch on re-render', async () => {
    const thread = makeThread();
    const { rerender } = render(<WhatChangedSinceLastTime thread={thread} />);

    await waitFor(() => {
      expect(mockFetchWhatChanged).toHaveBeenCalledTimes(1);
    });

    rerender(<WhatChangedSinceLastTime thread={thread} />);
    await new Promise(r => setTimeout(r, 50));
    expect(mockFetchWhatChanged).toHaveBeenCalledTimes(1);
  });

  it('handles fetch error silently — renders nothing', async () => {
    mockFetchWhatChanged.mockRejectedValue(new Error('server error'));
    const thread = makeThread();
    const { container } = render(<WhatChangedSinceLastTime thread={thread} />);

    await waitFor(() => {
      expect(mockFetchWhatChanged).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });
});
