import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../test/utils';
import { LocationBook } from './LocationBook';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { useMockData } from '../../contexts/MockDataContext';
import { mockDataService } from '../../services/mockDataService';
import { locationBookDemoLocations } from '../../mocks/locationBookDemo';

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: vi.fn(),
}));

vi.mock('../../contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestState: null,
    startGuestSession: vi.fn(),
    endGuestSession: vi.fn(),
    incrementChatMessage: vi.fn(() => false),
    canSendChatMessage: () => true,
  }),
  GUEST_CHAT_LIMIT: 5,
}));

// LocationBook reads its data from mockDataService when mock mode is on —
// force it on regardless of the store's real default so this test isn't
// coupled to that default.
vi.mock('../../contexts/MockDataContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../contexts/MockDataContext')>()),
  useMockData: vi.fn(),
}));

describe('LocationBook — "X of Y places" summary', () => {
  beforeEach(() => {
    vi.mocked(useLoreKeeper).mockReturnValue({ entries: [] } as unknown as ReturnType<typeof useLoreKeeper>);
    vi.mocked(useMockData).mockReturnValue({
      useMockData: true,
      toggleMockData: vi.fn(),
      setUseMockData: vi.fn(),
      isMockDataActive: true,
      setIsMockDataActive: vi.fn(),
      backendUnavailable: false,
      backendHealth: null,
      runtimeDataMode: 'DEMO',
      runtimeIdentity: 'DEMO_RUNTIME',
    } as unknown as ReturnType<typeof useMockData>);
    mockDataService.register.locations(locationBookDemoLocations);
  });

  it('denominator matches the population a book query actually searched, not the top-level-only default', async () => {
    render(<LocationBook />);

    // Sanity: the fixture has 10 top-level places + 1 nested child ("Novara Design Lab").
    await waitFor(() => {
      expect(screen.getByText(/of 10 places/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/places I visited with Marcus/i);
    await userEvent.type(input, 'places inside Novara HQ');
    await userEvent.keyboard('{Enter}');

    // Regression: this query matches only the nested "Novara Design Lab" — a
    // location that is NOT one of the 10 top-level places. The denominator
    // must switch to the full population that was actually searched (11),
    // not stay pinned at the top-level-only count (10), or the summary lies
    // about what was searched.
    await waitFor(() => {
      expect(screen.getByText(/1 of 11 places/i)).toBeInTheDocument();
    });
  });
});
