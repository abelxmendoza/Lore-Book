import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import {
  MockDataProvider,
  useMockData,
  getGlobalMockDataEnabled,
  setGlobalMockDataEnabled,
} from './MockDataContext';
import { ReduxProvider } from '../store/ReduxProvider';
import { makeStore } from '../store';
import { setAuthSession } from '../store/slices/authSlice';
import { DEMO_SESSION_KEY } from '../lib/demoRuntime';

/** useLocation() (added for the demo/admin route-leak fix) requires a Router ancestor. */
function withRouter(children: ReactNode, initialPath = '/') {
  return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>;
}

vi.mock('../config/env', () => ({
  config: {
    dev: { allowMockData: true },
    api: { url: '' },
  },
}));

const ThrowsOutside = () => {
  useMockData();
  return null;
};

const ReadsContext = () => {
  const { useMockData: value } = useMockData();
  return <span data-testid="value">{String(value)}</span>;
};

const ReadsBackendUnavailable = () => {
  const { backendUnavailable, backendHealth } = useMockData();
  return (
    <>
      <span data-testid="backend-unavailable">{String(backendUnavailable)}</span>
      <span data-testid="backend-health">
        {backendHealth && !backendHealth.ok ? `${backendHealth.kind}:${backendHealth.status ?? ''}` : 'none'}
      </span>
    </>
  );
};

describe('MockDataContext', () => {
  describe('useMockData', () => {
    it('throws when used outside MockDataProvider', () => {
      expect(() => render(<ThrowsOutside />)).toThrow('useMockData must be used within MockDataProvider');
    });

    it('returns context when inside MockDataProvider', () => {
      render(
        withRouter(
          <ReduxProvider>
            <MockDataProvider>
              <ReadsContext />
            </MockDataProvider>
          </ReduxProvider>
        )
      );
      expect(screen.getByTestId('value').textContent).toMatch(/true|false/);
    });
  });

  describe('MockDataProvider', () => {
    it('renders children', () => {
      render(
        withRouter(
          <ReduxProvider>
            <MockDataProvider>
              <div data-testid="child">Child</div>
            </MockDataProvider>
          </ReduxProvider>
        )
      );
      expect(screen.getByTestId('child')).toHaveTextContent('Child');
    });

    it('sets backendUnavailable and enables mock when /api/health fails', async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        if (url.includes('/api/health')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({}),
            text: async () => '',
            headers: new Headers(),
          } as Response);
        }
        return originalFetch.call(globalThis, input);
      });
      globalThis.fetch = mockFetch;

      try {
        render(
          withRouter(
            <ReduxProvider>
              <MockDataProvider>
                <ReadsBackendUnavailable />
                <ReadsContext />
              </MockDataProvider>
            </ReduxProvider>
          )
        );

        await waitFor(
          () => {
            expect(screen.getByTestId('backend-unavailable').textContent).toBe('true');
          },
          { timeout: 3000 }
        );
        expect(screen.getByTestId('backend-health')).toHaveTextContent('http_error:500');
        await waitFor(
          () => {
            expect(screen.getByTestId('value').textContent).toBe('true');
          },
          { timeout: 1000 }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('preserves 502 backend health diagnostics for deployed host failures', async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        if (url.includes('/api/health')) {
          return Promise.resolve({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: async () => ({}),
            text: async () => '',
            headers: new Headers(),
          } as Response);
        }
        return originalFetch.call(globalThis, input);
      });
      globalThis.fetch = mockFetch;

      try {
        render(
          withRouter(
            <ReduxProvider>
              <MockDataProvider>
                <ReadsBackendUnavailable />
              </MockDataProvider>
            </ReduxProvider>
          )
        );

        await waitFor(
          () => {
            expect(screen.getByTestId('backend-health')).toHaveTextContent('http_error:502');
          },
          { timeout: 3000 }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('clears a lingering demo session and mock data once an authenticated user is off /demo', async () => {
      // Simulates: an already-signed-in user opens the public /demo sandbox
      // (allowed by design), then routes back into the real app via an
      // internal link rather than the explicit "Exit demo" control. The
      // sessionStorage demo flag would otherwise survive and leak mock data
      // into their real account.
      sessionStorage.setItem(DEMO_SESSION_KEY, 'true');

      const testStore = makeStore();
      const user = { id: 'admin-1', email: 'admin@example.com' } as never;
      testStore.dispatch(setAuthSession({ user, session: { user } as never }));

      try {
        render(
          withRouter(
            <Provider store={testStore}>
              <MockDataProvider>
                <ReadsContext />
              </MockDataProvider>
            </Provider>,
            '/characters'
          )
        );

        await waitFor(() => {
          expect(screen.getByTestId('value').textContent).toBe('false');
        });
        expect(sessionStorage.getItem(DEMO_SESSION_KEY)).toBeNull();
      } finally {
        sessionStorage.removeItem(DEMO_SESSION_KEY);
      }
    });
  });

  describe('getGlobalMockDataEnabled / setGlobalMockDataEnabled', () => {
    it('get returns value set by set', () => {
      setGlobalMockDataEnabled(true);
      expect(getGlobalMockDataEnabled()).toBe(true);
      setGlobalMockDataEnabled(false);
      expect(getGlobalMockDataEnabled()).toBe(false);
    });
  });
});
