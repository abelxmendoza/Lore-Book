import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { Sidebar } from './Sidebar';

const mockNavigate = vi.fn();

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
  });

  it('renders Chat with "Your story starts here" tagline', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getAllByText('Chat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Your story starts here').length).toBeGreaterThanOrEqual(1);
  });

  it('renders section labels: Focus on…, Gossip & claims, Explore your story', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getAllByText('Focus on…').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Gossip & claims').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Explore your story').length).toBeGreaterThanOrEqual(1);
  });

  it('renders section labels: Your content, Data, Account & help', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getAllByText('Your content').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Data').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Account & help').length).toBeGreaterThanOrEqual(1);
  });

  it('renders story-entity nav: Characters, Locations, Life Log, Groups, Skills, Dating & Romance', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getAllByRole('button', { name: /Open chat interface/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open characters view/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open locations view/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open life log/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open groups view/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open skills view/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Open love and relationships/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('navigates when Chat is clicked', async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);
    const chatButtons = screen.getAllByRole('button', { name: /Open chat interface/i });
    await user.click(chatButtons[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });
});
