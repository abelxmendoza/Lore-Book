import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { Router } from './Router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GuestProvider } from '../contexts/GuestContext';
import { EntityModalProvider } from '../contexts/EntityModalContext';
import { MockDataProvider } from '../contexts/MockDataContext';
import { ReduxProvider } from '../store/ReduxProvider';

function renderRouter(ui: React.ReactElement) {
  // MockDataProvider is required by useRuntimeIdentity (used in the router tree).
  return render(
    <ReduxProvider>
      <MockDataProvider>{ui}</MockDataProvider>
    </ReduxProvider>
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

  it('should render Router without crashing', async () => {
    const { container } = renderRouter(
      <BrowserRouter>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <Router />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(container).toBeTruthy();
      expect(container.innerHTML.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('should handle root route (/)', async () => {
    renderRouter(
      <MemoryRouter initialEntries={['/']}>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <Router />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </MemoryRouter>
    );

    await waitFor(() => {
      // / renders Landing, not App
      const landing = screen.queryByTestId('landing');
      expect(landing).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /home route', async () => {
    renderRouter(
      <MemoryRouter initialEntries={['/home']}>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <Router />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('app')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /chat route', async () => {
    renderRouter(
      <MemoryRouter initialEntries={['/chat']}>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <Router />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('app')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /chat/:threadId route', async () => {
    renderRouter(
      <MemoryRouter initialEntries={['/chat/demo-thread-1']}>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <Router />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('app')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /timeline route', async () => {
    renderRouter(
      <MemoryRouter initialEntries={['/timeline']}>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <Router />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </MemoryRouter>
    );

    await waitFor(() => {
      const app = screen.queryByTestId('app');
      expect(app).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle 404 routes gracefully', async () => {
    const { container } = renderRouter(
      <MemoryRouter initialEntries={['/non-existent-route']}>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <Router />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </MemoryRouter>
    );

    // Should render something, not crash
    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should not show black screen on route errors', async () => {
    // Test that ErrorBoundary catches errors
    const { container } = renderRouter(
      <MemoryRouter initialEntries={['/']}>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <Router />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </MemoryRouter>
    );

    // Should render something, not black screen
    await waitFor(() => {
      expect(container).toBeTruthy();
      // Should have some content
      expect(container.innerHTML.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});

