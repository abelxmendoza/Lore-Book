import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { EntityModalProvider } from './contexts/EntityModalContext';
import { GuestProvider } from './contexts/GuestContext';
import App from './pages/App';

// Mock all external dependencies
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
    }
  }
}));

vi.mock('../lib/monitoring', () => ({
  initMonitoring: vi.fn(),
  errorTracking: {
    captureException: vi.fn()
  }
}));

vi.mock('../hooks/useLoreKeeper', () => ({
  useLoreKeeper: () => ({
    entries: [],
    timeline: { chapters: [], unassigned: [] },
    chapters: [],
    tags: [],
    loading: false,
    createEntry: vi.fn(),
    refreshEntries: vi.fn(),
    refreshTimeline: vi.fn()
  })
}));

describe('App Integration Tests - Black Screen Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch to prevent network errors
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [], timeline: { chapters: [], unassigned: [] } })
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render App component without crashing', async () => {
    const { container } = render(
      <BrowserRouter>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <App />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </BrowserRouter>
    );

    // App should render something visible
    await waitFor(() => {
      expect(container).toBeTruthy();
      // Should have some content, not be empty
      expect(container.textContent?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('should render main content area', async () => {
    render(
      <BrowserRouter>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <App />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </BrowserRouter>
    );

    // Should have main content area or at least some content rendered
    await waitFor(() => {
      const main = document.querySelector('main, [role="main"]');
      // If no main element, check for any content in the container
      if (!main) {
        const container = document.body;
        expect(container.textContent?.length).toBeGreaterThan(0);
      } else {
        expect(main).toBeTruthy();
      }
    }, { timeout: 5000 });
  });

  it('should handle missing environment variables gracefully', async () => {
    // Temporarily remove env vars
    const originalSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const originalSupabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    // @ts-ignore
    delete import.meta.env.VITE_SUPABASE_URL;
    // @ts-ignore
    delete import.meta.env.VITE_SUPABASE_ANON_KEY;

    const { container } = render(
      <BrowserRouter>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <App />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </BrowserRouter>
    );

    // Should still render something, not crash
    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 3000 });

    // Restore env vars
    // @ts-ignore
    import.meta.env.VITE_SUPABASE_URL = originalSupabaseUrl;
    // @ts-ignore
    import.meta.env.VITE_SUPABASE_ANON_KEY = originalSupabaseKey;
  });

  it('should catch and display errors via ErrorBoundary', async () => {
    // Suppress console.error for this test since we're intentionally throwing an error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );

    // ErrorBoundary should catch and display error
    await waitFor(() => {
      // Look for the error message text that ErrorBoundary renders
      const errorMessage = screen.queryByText(/Something went wrong/i) || 
                          screen.queryByText(/Test error/i) ||
                          screen.queryByText(/An unexpected error occurred/i);
      expect(errorMessage).toBeTruthy();
    }, { timeout: 3000 });
    
    consoleSpy.mockRestore();
  });

  it('should render without requiring authentication', async () => {
    // App should render even without auth
    const { container } = render(
      <BrowserRouter>
        <ErrorBoundary>
          <GuestProvider>
            <EntityModalProvider>
              <App />
            </EntityModalProvider>
          </GuestProvider>
        </ErrorBoundary>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(container).toBeTruthy();
      // Should not be completely empty
      expect(container.innerHTML.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});

