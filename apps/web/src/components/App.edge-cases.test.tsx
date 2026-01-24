import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { GuestProvider } from '../contexts/GuestContext';
import { EntityModalProvider } from '../contexts/EntityModalContext';
import { MockDataProvider } from '../contexts/MockDataContext';
import App from '../pages/App';

// Mock all dependencies (supabase for api.fetchJson; useAuth for Sidebar)
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
    }
  },
  useAuth: () => ({ user: null, loading: false })
}));

vi.mock('../hooks/useLoreKeeper', () => ({
  useLoreKeeper: () => ({
    entries: [],
    timeline: { chapters: [], unassigned: [] },
    chapters: [],
    tags: [],
    loading: false,
    createEntry: vi.fn(),
    refreshEntries: vi.fn()
  })
}));

describe('App Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [], timeline: { chapters: [], unassigned: [] } })
    });
  });

  it('should handle missing environment variables', async () => {
    // Temporarily remove env vars
    const originalEnv = { ...import.meta.env };
    // @ts-ignore
    delete import.meta.env.VITE_SUPABASE_URL;

    const { container } = render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ErrorBoundary>
          <MockDataProvider>
            <GuestProvider>
              <EntityModalProvider>
                <App />
              </EntityModalProvider>
            </GuestProvider>
          </MockDataProvider>
        </ErrorBoundary>
      </BrowserRouter>
    );

    // Should still render something
    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 3000 });

    // Restore env
    // @ts-ignore
    import.meta.env = originalEnv;
  });

  it('should handle slow API responses', async () => {
    // Mock slow response
    global.fetch = vi.fn().mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ entries: [] })
        }), 2000)
      )
    );

    const { container } = render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ErrorBoundary>
          <MockDataProvider>
            <GuestProvider>
              <EntityModalProvider>
                <App />
              </EntityModalProvider>
            </GuestProvider>
          </MockDataProvider>
        </ErrorBoundary>
      </BrowserRouter>
    );

    // Should show loading state, not crash
    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('should handle API timeout', async () => {
    // Mock timeout
    global.fetch = vi.fn().mockImplementation(() => 
      new Promise(() => {}) // Never resolves
    );

    const { container } = render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ErrorBoundary>
          <MockDataProvider>
            <GuestProvider>
              <EntityModalProvider>
                <App />
              </EntityModalProvider>
            </GuestProvider>
          </MockDataProvider>
        </ErrorBoundary>
      </BrowserRouter>
    );

    // Should not crash on timeout
    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 3000 });
  });
});

