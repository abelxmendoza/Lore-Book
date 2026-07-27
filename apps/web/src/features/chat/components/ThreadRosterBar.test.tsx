import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThreadRosterBar } from './ThreadRosterBar';
import type { ThreadRosterResponse } from '../../../api/threadRoster';

vi.mock('../../../lib/supabase', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'test-user' }, session: null, loading: false })),
}));

const rosterResponse: ThreadRosterResponse = {
  success: true,
  threadNumber: 3,
  entries: [
    {
      entityId: 'char-1',
      name: 'Ashley',
      kind: 'character',
      actorType: 'PERSON',
      role: 'main',
      status: 'active',
      source: 'auto',
      mentions: 5,
      firstSeenRef: '#1',
      lastSeenRef: '#10',
      pinned: false,
    },
  ],
};

vi.mock('../../../api/threadRoster', async () => {
  const actual = await vi.importActual<typeof import('../../../api/threadRoster')>(
    '../../../api/threadRoster',
  );
  return {
    ...actual,
    fetchThreadRoster: vi.fn(() => Promise.resolve(rosterResponse)),
  };
});

describe('ThreadRosterBar collapse toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts collapsed (avoids duplicating ThreadSummaryBar) and reveals chips on expand', async () => {
    render(<ThreadRosterBar threadId="thread-1" messageCount={4} />);

    // Header renders immediately; chip fetch resolves async, but stays hidden while collapsed.
    const toggle = await screen.findByTestId('thread-roster-collapse-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('roster-chip')).not.toBeInTheDocument();
    // The count stays visible in the collapsed header.
    expect(screen.getByText('· 1')).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByTestId('roster-chip')).toBeInTheDocument();
    expect(screen.getByText('Ashley')).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.queryByTestId('roster-chip')).not.toBeInTheDocument();
  });
});
