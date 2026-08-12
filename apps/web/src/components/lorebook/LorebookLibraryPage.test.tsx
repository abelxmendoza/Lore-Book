import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LorebookLibraryPage } from './LorebookLibraryPage';

const mockNavigate = vi.fn();
const libraryMode = vi.hoisted(() => ({
  useMock: true,
  isSimulated: true,
  simulationEnabled: true,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => libraryMode.useMock,
}));

vi.mock('../../hooks/useLoreReadiness', () => ({
  useLoreReadiness: () => ({
    compiledBooks: [
      { id: 'demo-1', title: 'The Keeper of Marrowvale', created_at: '2025-01-01', chapterCount: 6 },
      { id: 'demo-2', title: 'Mira Solenne', created_at: '2025-01-01', chapterCount: 4 },
    ],
    loading: false,
    refresh: async () => {},
    readiness: null,
    hasCompiledBook: true,
    isSimulated: libraryMode.isSimulated,
  }),
}));

vi.mock('../../contexts/LoreReadinessSimulationContext', () => ({
  useLoreReadinessSimulationOptional: () => ({
    simulationEnabled: libraryMode.simulationEnabled,
    preset: 'rich',
  }),
}));

describe('LorebookLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    libraryMode.useMock = true;
    libraryMode.isSimulated = true;
    libraryMode.simulationEnabled = true;
    localStorage.removeItem('demo_core_lorebooks_v2');
    localStorage.removeItem('demo_edition_fixtures_seeded_v1');
  });

  it('uses demo editions in unconfigured local dev when stored simulation is on', async () => {
    libraryMode.useMock = false;
    libraryMode.isSimulated = false;
    libraryMode.simulationEnabled = true;

    render(
      <MemoryRouter>
        <LorebookLibraryPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Career at Vanguard Robotics')).toBeInTheDocument();
    expect(screen.getByText(/v3 · 3 versions/i)).toBeInTheDocument();
  });

  it('opens seeded edition history for a selected demo subject in a modal', async () => {
    render(
      <MemoryRouter>
        <LorebookLibraryPage />
      </MemoryRouter>
    );

    const careerTitle = (await screen.findAllByText('Career at Vanguard Robotics'))[0];
    const card = careerTitle.closest('article');
    expect(card).not.toBeNull();
    expect(within(card!).getByText(/v3 · 3 versions/i)).toBeInTheDocument();
    expect(screen.getByText('Relationships — Jamie & Marcus')).toBeInTheDocument();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(within(card!).getByRole('button', { name: /edition history · 3 versions/i }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByText('Edition History')).toBeInTheDocument();
      expect(within(dialog).getByText('v3')).toBeInTheDocument();
      expect(within(dialog).getByText('v2')).toBeInTheDocument();
      expect(within(dialog).getByText('v1')).toBeInTheDocument();
    });

    fireEvent.click(within(dialog).getByRole('button', { name: /close edition history/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('renders compiled lorebooks heading and demo books', () => {
    render(
      <MemoryRouter>
        <LorebookLibraryPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /lorebook library/i })).toBeInTheDocument();
    expect(screen.getByText('The Keeper of Marrowvale')).toBeInTheDocument();
  });

  it('renders read, edit, and download actions on each book', () => {
    render(
      <MemoryRouter>
        <LorebookLibraryPage />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('button', { name: /^Read$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Edit$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^PDF$/i }).length).toBeGreaterThan(0);
  });

  it('navigates back to generate page', () => {
    render(
      <MemoryRouter>
        <LorebookLibraryPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/lorebook');
  });

  it('shows a new-content meter and regenerate nudge for a stale core edition', async () => {
    render(
      <MemoryRouter>
        <LorebookLibraryPage />
      </MemoryRouter>
    );

    // Seeded fixtures carry hand-authored snapshot hashes that never match a
    // live 'rich' forge run, so the meter should surface for both of them.
    const careerTitle = (await screen.findAllByText('Career at Vanguard Robotics'))[0];
    const card = careerTitle.closest('article');
    expect(card).not.toBeNull();

    await waitFor(() => {
      expect(within(card!).getByText(/new .* since v3 — a new edition is ready to generate/i)).toBeInTheDocument();
    });
    expect(within(card!).getByRole('button', { name: /regenerate with new memories/i })).toBeInTheDocument();
  });
});
