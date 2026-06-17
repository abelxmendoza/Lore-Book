import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuestProvider, useGuest, GUEST_CHAT_LIMIT } from './GuestContext';

vi.mock('./MockDataContext', () => ({
  setGlobalIsGuest: vi.fn(),
}));

const GuestControls = () => {
  const {
    guestState,
    startGuestSession,
    incrementChatMessage,
    canSendChatMessage,
    isGuest,
  } = useGuest();

  return (
    <div>
      <span data-testid="is-guest">{String(isGuest)}</span>
      <span data-testid="used">{guestState?.chatMessagesUsed ?? 0}</span>
      <span data-testid="limit">{guestState?.chatLimit ?? 0}</span>
      <span data-testid="can-send">{String(canSendChatMessage())}</span>
      <button type="button" onClick={startGuestSession}>
        Start
      </button>
      <button type="button" onClick={() => incrementChatMessage()}>
        Increment
      </button>
    </div>
  );
};

describe('GuestContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('caps guest chat at GUEST_CHAT_LIMIT messages', async () => {
    const user = userEvent.setup();
    render(
      <GuestProvider>
        <GuestControls />
      </GuestProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByTestId('limit')).toHaveTextContent(String(GUEST_CHAT_LIMIT));

    for (let i = 0; i < GUEST_CHAT_LIMIT; i++) {
      expect(screen.getByTestId('can-send')).toHaveTextContent('true');
      await user.click(screen.getByRole('button', { name: 'Increment' }));
    }

    expect(screen.getByTestId('used')).toHaveTextContent(String(GUEST_CHAT_LIMIT));
    expect(screen.getByTestId('can-send')).toHaveTextContent('false');
  });

  it('persists guest usage cap across reloads', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <GuestProvider>
        <GuestControls />
      </GuestProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < GUEST_CHAT_LIMIT; i++) {
      await user.click(screen.getByRole('button', { name: 'Increment' }));
    }

    unmount();

    render(
      <GuestProvider>
        <GuestControls />
      </GuestProvider>
    );

    expect(screen.getByTestId('used')).toHaveTextContent(String(GUEST_CHAT_LIMIT));
    expect(screen.getByTestId('can-send')).toHaveTextContent('false');
  });

  it('resets guest usage on a new calendar day', async () => {
    const yesterday = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem(
      'lorekeeper_guest_state',
      JSON.stringify({
        isGuest: true,
        guestId: 'guest_test',
        chatMessagesUsed: GUEST_CHAT_LIMIT,
        chatLimit: GUEST_CHAT_LIMIT,
        createdAt: yesterday,
      })
    );

    await act(async () => {
      render(
        <GuestProvider>
          <GuestControls />
        </GuestProvider>
      );
    });

    expect(screen.getByTestId('used')).toHaveTextContent('0');
    expect(screen.getByTestId('can-send')).toHaveTextContent('true');
  });
});
