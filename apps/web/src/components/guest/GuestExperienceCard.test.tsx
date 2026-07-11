import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { GuestExperienceCard } from './GuestExperienceCard';
import { resetGuestExperienceDismissed } from '../../hooks/useGuestExperienceDismiss';
import { GUEST_CHAT_LIMIT } from '../../contexts/GuestContext';

const mockGuestState = {
  isGuest: true,
  guestId: 'guest_test',
  chatMessagesUsed: 0,
  chatLimit: GUEST_CHAT_LIMIT,
  createdAt: Date.now(),
};

vi.mock('../../contexts/GuestContext', () => ({
  useGuest: () => ({
    guestState: mockGuestState,
    endGuestSession: vi.fn(),
  }),
  GUEST_CHAT_LIMIT: 5,
}));

vi.mock('../../hooks/useRuntimeIdentity', () => ({
  useRuntimeIdentity: () => ({ is: { demo: false } }),
}));

function renderCompact() {
  return render(
    <MemoryRouter>
      <GuestExperienceCard variant="compact" showEndSession={false} />
    </MemoryRouter>,
  );
}

describe('GuestExperienceCard — compact dismiss', () => {
  beforeEach(() => {
    resetGuestExperienceDismissed();
  });

  it('renders guest usage bar', () => {
    renderCompact();
    expect(screen.getByText('Guest · 5/5 messages left')).toBeInTheDocument();
    expect(screen.getByText('Guest chat usage')).toBeInTheDocument();
  });

  it('can be dismissed with the close button', async () => {
    const user = userEvent.setup();
    renderCompact();

    await user.click(screen.getByTestId('guest-experience-dismiss'));

    expect(screen.queryByText('Guest · 5/5 messages left')).not.toBeInTheDocument();
  });

  it('stays dismissed across remounts in the same session', async () => {
    const user = userEvent.setup();
    const first = renderCompact();
    await user.click(screen.getByTestId('guest-experience-dismiss'));
    first.unmount();

    renderCompact();
    expect(screen.queryByText('Guest · 5/5 messages left')).not.toBeInTheDocument();
  });
});
