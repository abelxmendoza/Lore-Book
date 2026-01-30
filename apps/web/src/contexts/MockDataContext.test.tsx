import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  MockDataProvider,
  useMockData,
  getGlobalMockDataEnabled,
  setGlobalMockDataEnabled,
} from './MockDataContext';

const ThrowsOutside = () => {
  useMockData();
  return null;
};

const ReadsContext = () => {
  const { useMockData: value } = useMockData();
  return <span data-testid="value">{String(value)}</span>;
};

const ReadsBackendUnavailable = () => {
  const { backendUnavailable } = useMockData();
  return <span data-testid="backend-unavailable">{String(backendUnavailable)}</span>;
};

describe('MockDataContext', () => {
  describe('useMockData', () => {
    it('throws when used outside MockDataProvider', () => {
      expect(() => render(<ThrowsOutside />)).toThrow('useMockData must be used within MockDataProvider');
    });

    it('returns context when inside MockDataProvider', () => {
      render(
        <MockDataProvider>
          <ReadsContext />
        </MockDataProvider>
      );
      expect(screen.getByTestId('value').textContent).toMatch(/true|false/);
    });
  });

  describe('MockDataProvider', () => {
    it('renders children', () => {
      render(
        <MockDataProvider>
          <div data-testid="child">Child</div>
        </MockDataProvider>
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
          <MockDataProvider>
            <ReadsBackendUnavailable />
            <ReadsContext />
          </MockDataProvider>
        );

        await waitFor(
          () => {
            expect(screen.getByTestId('backend-unavailable').textContent).toBe('true');
          },
          { timeout: 3000 }
        );
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
