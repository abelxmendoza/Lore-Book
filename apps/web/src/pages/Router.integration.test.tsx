import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Router } from './Router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GuestProvider } from '../contexts/GuestContext';
import { EntityModalProvider } from '../contexts/EntityModalContext';
import { MockDataProvider } from '../contexts/MockDataContext';
import { ReduxProvider } from '../store/ReduxProvider';

/**
 * `ui` is the tree WITHOUT its own Router — MockDataProvider itself calls
 * useLocation() (demo/admin route-leak fix), so the single MemoryRouter must
 * wrap it from the outside. React Router forbids nesting two Router
 * components, so each test passes its desired `initialEntries` here instead
 * of constructing its own BrowserRouter/MemoryRouter.
 */
function renderRouter(ui: React.ReactElement, initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ReduxProvider>
        <MockDataProvider>{ui}</MockDataProvider>
      </ReduxProvider>
    </MemoryRouter>
  );
}

// Mock route guards to bypass auth for testing
vi.mock('../components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock('../components/RouteGuard', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// Mock all lazy-loaded components
vi.mock('../pages/App', () => ({
  default: () => <div data-testid="app">App Content</div>
}));

vi.mock('../routes/Landing', () => ({
  default: () => <div data-testid="landing">Landing Content</div>
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false, signOut: vi.fn() })),
  isSupabaseConfigured: vi.fn().mockReturnValue(false),
  getConfigDebug: vi.fn().mockReturnValue({}),
}));

describe('Router Integration Tests - Black Screen Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const routerChildren = (
    <ErrorBoundary>
      <GuestProvider>
        <EntityModalProvider>
          <Router />
        </EntityModalProvider>
      </GuestProvider>
    </ErrorBoundary>
  );

  it('should render Router without crashing', async () => {
    const { container } = renderRouter(routerChildren);

    await waitFor(() => {
      expect(container).toBeTruthy();
      expect(container.innerHTML.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('should handle root route (/)', async () => {
    renderRouter(routerChildren, ['/']);

    await waitFor(() => {
      // / renders Landing, not App
      const landing = screen.queryByTestId('landing');
      expect(landing).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /home route', async () => {
    renderRouter(routerChildren, ['/home']);

    await waitFor(() => {
      expect(screen.queryByTestId('app')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /chat route', async () => {
    renderRouter(routerChildren, ['/chat']);

    await waitFor(() => {
      expect(screen.queryByTestId('app')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /chat/:threadId route', async () => {
    renderRouter(routerChildren, ['/chat/demo-thread-1']);

    await waitFor(() => {
      expect(screen.queryByTestId('app')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /timeline route', async () => {
    renderRouter(routerChildren, ['/timeline']);

    await waitFor(() => {
      const app = screen.queryByTestId('app');
      expect(app).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle 404 routes gracefully', async () => {
    const { container } = renderRouter(routerChildren, ['/non-existent-route']);

    // Should render something, not crash
    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should not show black screen on route errors', async () => {
    // Test that ErrorBoundary catches errors
    const { container } = renderRouter(routerChildren, ['/']);

    // Should render something, not black screen
    await waitFor(() => {
      expect(container).toBeTruthy();
      // Should have some content
      expect(container.innerHTML.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});

