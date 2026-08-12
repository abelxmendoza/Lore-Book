import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LorebookLibraryPage } from './LorebookLibraryPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => true,
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
    isSimulated: true,
  }),
}));

describe('LorebookLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('demo_core_lorebooks_v2');
    localStorage.removeItem('demo_edition_fixtures_seeded_v1');
  });

  it('shows seeded edition history for selected demo subjects', async () => {
    render(
      <MemoryRouter>
        <LorebookLibraryPage />
      </MemoryRouter>
    );

    const careerTitle = await screen.findByText('Career at Vanguard Robotics');
    const card = careerTitle.closest('article');
    expect(card).not.toBeNull();
    expect(within(card!).getByText(/v3 · 3 versions/i)).toBeInTheDocument();
    expect(screen.getByText('Relationships — Jamie & Marcus')).toBeInTheDocument();

    fireEvent.click(within(card!).getByRole('button', { name: /2 older versions/i }));
    await waitFor(() => {
      expect(within(card!).getByText('Edition History')).toBeInTheDocument();
      expect(within(card!).getByText('v3')).toBeInTheDocument();
      expect(within(card!).getByText('v2')).toBeInTheDocument();
      expect(within(card!).getByText('v1')).toBeInTheDocument();
    });
    expect(card).toHaveClass('xl:col-span-3');
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
});
