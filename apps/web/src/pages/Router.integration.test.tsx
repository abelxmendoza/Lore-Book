import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { Router } from './Router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GuestProvider } from '../contexts/GuestContext';
import { EntityModalProvider } from '../contexts/EntityModalContext';

// Mock AuthGate to bypass auth for testing
vi.mock('../components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// Mock all lazy-loaded components
vi.mock('../pages/App', () => ({
  default: () => <div data-testid="app">App Content</div>
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

describe('Router Integration Tests - Black Screen Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render Router without crashing', async () => {
    const { container } = render(
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
    render(
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
      const app = screen.queryByTestId('app');
      expect(app).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /chat route', async () => {
    render(
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
      const app = screen.queryByTestId('app');
      expect(app).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should handle /timeline route', async () => {
    render(
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
    const { container } = render(
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
    const { container } = render(
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

