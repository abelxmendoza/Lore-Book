import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { Sidebar } from './Sidebar';

const { mockNavigate, demoRuntime, mockClearDemoSession } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  demoRuntime: { current: false },
  mockClearDemoSession: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/chat' }),
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  useAuth: () => ({ user: { id: 'user-1' }, session: null, loading: false, signOut: vi.fn() }),
  isSupabaseConfigured: vi.fn().mockReturnValue(false),
  getConfigDebug: vi.fn().mockReturnValue({}),
}));

vi.mock('../hooks/useAccountAuthority', () => ({
  useAccountAuthority: () => ({ authority: null, loading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('../contexts/GuestContext', () => ({
  GUEST_CHAT_LIMIT: 5,
  useGuest: () => ({
    isGuest: false,
    guestState: null,
    startGuestSession: vi.fn(),
    endGuestSession: vi.fn(),
    incrementChatMessage: vi.fn(() => false),
    canSendChatMessage: () => true,
  }),
}));

vi.mock('../middleware/roleGuard', () => ({
  canAccessAdmin: () => false,
}));

vi.mock('../lib/demoRuntime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/demoRuntime')>()),
  isDemoRuntimeActive: () => demoRuntime.current,
  clearDemoSession: mockClearDemoSession,
}));

vi.mock('../utils/routeMapping', () => ({
  surfaceToRoute: {
    chat: '/chat',
    characters: '/characters',
    locations: '/locations',
    timeline: '/timeline',
    discovery: '/discovery',
    perceptions: '/perceptions',
    events: '/events',
    love: '/love',
    quests: '/quests',
    memoir: '/memoir',
    lorebook: '/lorebook/library',
    photos: '/photos',
    entities: '/entities',
    organizations: '/organizations',
    skills: '/skills',
    subscription: '/subscription',
    security: '/security',
    guide: '/guide',
  },
  getRouteFromSurface: (s: string) => `/${s}`,
}));

describe('Sidebar', () => {
  const defaultProps = {
    activeSurface: 'chat' as const,
    onSurfaceChange: vi.fn(),
    onMobileDrawerClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    demoRuntime.current = false;
  });

  it('renders Chat with "Your story starts here" tagline', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getAllByText('Chat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Your story starts here').length).toBeGreaterThanOrEqual(1);
  });

  it('renders section labels: Focus on…, Beliefs & evidence, Explore your story', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getAllByText('Focus on…').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Beliefs & evidence').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Explore your story').length).toBeGreaterThanOrEqual(1);
  });

  it('renders section labels: Your content, Data, Account & help', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getAllByText('Your content').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Data').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Account & help').length).toBeGreaterThanOrEqual(1);
  });

  it('locks the mobile drawer to vertical scrolling only', () => {
    render(<Sidebar {...defaultProps} isMobileDrawerOpen />);

    const drawer = screen.getByTestId('mobile-sidebar-drawer');
    expect(drawer).toHaveClass('overflow-x-hidden', 'overscroll-x-none', 'touch-pan-y');

    // Desktop + mobile instances both render SidebarContent; every vertical
    // scroller must explicitly suppress the computed x-axis auto overflow.
    for (const scroller of screen.getAllByTestId('sidebar-scroll')) {
      expect(scroller).toHaveClass('overflow-x-hidden', 'overflow-y-auto', 'max-w-full');
    }
  });

  it('renders story-entity nav: Characters, Family, Dating & Romance, then Groups', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getAllByRole('button', { name: /Open chat interface/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open characters view/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open family view/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open love and relationships/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open groups view/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open locations view/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open life log/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open skills view/i }).length).toBeGreaterThanOrEqual(1);

    const focusButtons = screen
      .getAllByRole('button')
      .map((btn) => btn.getAttribute('aria-label') ?? '')
      .filter((label) =>
        [
          'Open characters view',
          'Open family view',
          'Open love and relationships',
          'Open groups view',
        ].includes(label),
      );
    // Desktop + mobile drawers both render the Focus on… cluster; assert the first cluster order.
    expect(focusButtons.slice(0, 4)).toEqual([
      'Open characters view',
      'Open family view',
      'Open love and relationships',
      'Open groups view',
    ]);
  });

  it('navigates when Chat is clicked', async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);
    const chatButtons = screen.getAllByRole('button', { name: /Open chat interface/i });
    await user.click(chatButtons[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });

  it('keeps Character Book navigation inside the public demo runtime', async () => {
    demoRuntime.current = true;
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    const characterButtons = screen.getAllByRole('button', { name: /Open characters view/i });
    await user.click(characterButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/demo/characters');
  });

  it('opens the populated demo-1 interface from the Editor link in demo runtime', async () => {
    demoRuntime.current = true;
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    await user.click(screen.getAllByRole('button', { name: /open lorebook editor/i })[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/memoir?book=demo-1');
    expect(defaultProps.onSurfaceChange).toHaveBeenCalledWith('memoir');
  });

  it('keeps the bare Editor route for real users so their default compiled book resolves', async () => {
    demoRuntime.current = false;
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    await user.click(screen.getAllByRole('button', { name: /open lorebook editor/i })[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/memoir');
  });

  it('clears the demo session before navigating to login when Exit is clicked', async () => {
    // Regression test: this button used to navigate to /login without
    // clearing the demo flag, so a subsequent real sign-in in the same tab
    // left isDemoRuntimeActive() stuck true — mixing demo state into the
    // authenticated (e.g. admin) session.
    demoRuntime.current = true;
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    const exitButton = screen.getByRole('button', { name: /^Exit$/i });
    await user.click(exitButton);

    expect(mockClearDemoSession).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('lists life browse surfaces before Quests under Explore your story', () => {
    render(<Sidebar {...defaultProps} />);

    const exploreButtons = screen
      .getAllByRole('button')
      .map((btn) => btn.getAttribute('aria-label') ?? '')
      .filter((label) =>
        [
          'Open life log',
          'Open timeline view',
          'Open Timelines Library',
          'Open narrative anchors',
          'Open life saga',
          'Open quests',
        ].includes(label),
      );

    // Desktop + mobile drawers both render the cluster; assert the first one.
    expect(exploreButtons.slice(0, 6)).toEqual([
      'Open life log',
      'Open timeline view',
      'Open Timelines Library',
      'Open narrative anchors',
      'Open life saga',
      'Open quests',
    ]);
    expect(screen.getAllByText(/Moments are things that happened/i).length).toBeGreaterThanOrEqual(1);
  });

  it('nests Timelines Library under Timeline and deep-links to the library view', async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    expect(screen.getAllByRole('button', { name: /Open timeline view/i }).length).toBeGreaterThanOrEqual(1);
    const libraryButtons = screen.getAllByTestId('sidebar-timelines-library');
    expect(libraryButtons.length).toBeGreaterThanOrEqual(1);

    await user.click(libraryButtons[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/timeline?view=library');
  });
});
