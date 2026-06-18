import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoreReadinessSimulationProvider, useLoreReadinessSimulation } from './LoreReadinessSimulationContext';
import { ReduxProvider } from '../store/ReduxProvider';

function renderWithStore(ui: React.ReactElement) {
  return render(<ReduxProvider>{ui}</ReduxProvider>);
}

vi.mock('../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => false,
  shouldUseMockData: () => false,
}));

vi.mock('../config/env', () => ({
  config: {
    dev: { allowMockData: true },
  },
}));

vi.mock('../lib/supabase', () => ({
  useAuth: () => ({ user: null, loading: false }),
  isSupabaseConfigured: () => false,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

function SimulationProbe() {
  const { preset, compiledMode, isSimulating, setPreset, setCompiledMode } = useLoreReadinessSimulation();
  return (
    <div>
      <span data-testid="preset">{preset}</span>
      <span data-testid="compiled">{compiledMode}</span>
      <span data-testid="simulating">{String(isSimulating)}</span>
      <button type="button" onClick={() => setPreset('empty')}>empty</button>
      <button type="button" onClick={() => setCompiledMode('none')}>no-books</button>
    </div>
  );
}

describe('LoreReadinessSimulationContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists preset and compiled mode in localStorage', async () => {
    const user = userEvent.setup();
    renderWithStore(
      <LoreReadinessSimulationProvider>
        <SimulationProbe />
      </LoreReadinessSimulationProvider>,
    );

    expect(screen.getByTestId('preset')).toHaveTextContent('rich');
    expect(screen.getByTestId('compiled')).toHaveTextContent('two');
    expect(screen.getByTestId('simulating')).toHaveTextContent('true');

    await user.click(screen.getByRole('button', { name: 'empty' }));
    await user.click(screen.getByRole('button', { name: 'no-books' }));

    expect(screen.getByTestId('preset')).toHaveTextContent('empty');
    expect(screen.getByTestId('compiled')).toHaveTextContent('none');

    const stored = JSON.parse(localStorage.getItem('lore_readiness_simulation_v1') ?? '{}');
    expect(stored.preset).toBe('empty');
    expect(stored.compiledMode).toBe('none');
  });

  it('restores from localStorage on mount', () => {
    localStorage.setItem(
      'lore_readiness_simulation_v1',
      JSON.stringify({ enabled: true, preset: 'sparse', compiledMode: 'one' })
    );

    renderWithStore(
      <LoreReadinessSimulationProvider>
        <SimulationProbe />
      </LoreReadinessSimulationProvider>,
    );

    expect(screen.getByTestId('preset')).toHaveTextContent('sparse');
    expect(screen.getByTestId('compiled')).toHaveTextContent('one');
  });
});
