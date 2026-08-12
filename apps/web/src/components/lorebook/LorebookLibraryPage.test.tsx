import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    localStorage.clear();
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

  it('shows Save as core edition buttons in demo mode', () => {
    render(
      <MemoryRouter>
        <LorebookLibraryPage />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('button', { name: /save as core edition/i }).length).toBeGreaterThan(0);
  });

  it('saving as core, then recompiling, produces real edition history in demo mode', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('My Life Story');
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter>
        <LorebookLibraryPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByRole('button', { name: /save as core edition/i })[0]);

    const recompileButton = await screen.findByRole('button', { name: /recompile from latest memory/i });
    fireEvent.click(recompileButton);

    const olderVersionsButton = await screen.findByRole('button', { name: /older version/i });
    expect(olderVersionsButton).toBeInTheDocument();

    fireEvent.click(olderVersionsButton);
    expect(await screen.findByText(/edition history/i)).toBeInTheDocument();
  });
});
