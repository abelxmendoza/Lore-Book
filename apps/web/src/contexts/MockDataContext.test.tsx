import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
