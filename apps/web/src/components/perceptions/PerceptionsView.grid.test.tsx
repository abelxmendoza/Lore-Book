import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { PerceptionsView } from './PerceptionsView';

vi.mock('../../api/perceptions', () => ({
  perceptionApi: {
    getPerceptions: vi.fn(async () => []),
    getPerceptionsAboutPerson: vi.fn(async () => []),
  },
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({
    useMockData: true,
    toggleMockData: vi.fn(),
    setUseMockData: vi.fn(),
    isMockDataActive: true,
    setIsMockDataActive: vi.fn(),
    backendUnavailable: false,
    backendHealth: null,
    runtimeDataMode: 'mock',
    runtimeIdentity: 'demo',
  }),
}));

vi.mock('../../hooks/useShouldUseMockData', () => ({
  shouldUseMockData: () => true,
}));

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: vi.fn(),
}));

function renderView() {
  // Lightweight store stub — PerceptionsView only needs MockDataContext mock above.
  const store = {
    getState: () => ({}),
    subscribe: () => () => {},
    dispatch: vi.fn(),
  } as any;

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <PerceptionsView showCreateButton={false} />
      </MemoryRouter>
    </Provider>,
  );
}

describe('PerceptionsView book grid', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('uses two equal columns on mobile viewports', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    renderView();

    const grid = await waitFor(() => screen.getByTestId('perception-book-grid'));
    expect(grid.style.display).toBe('grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('uses three equal columns on large viewports', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('1024'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    renderView();

    const grid = await waitFor(() => screen.getByTestId('perception-book-grid'));
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
  });
});
