import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoreBook } from './LoreBook';

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
    compiledBooks: [{ id: 'demo-1', title: 'The Keeper of Marrowvale', created_at: '2025-01-01', chapterCount: 5 }],
    loading: false,
    refresh: async () => {},
    readiness: null,
    hasCompiledBook: true,
    isSimulated: true,
  }),
}));

vi.mock('../../contexts/LoreReadinessSimulationContext', () => ({
  useLoreReadinessSimulation: () => ({
    preset: 'rich',
    addGeneratedBook: vi.fn(),
  }),
}));

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: () => ({ chapters: [] }),
}));

vi.mock('./LorebookShell', () => ({
  useLorebookShell: () => true,
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(async () => {
    throw new Error('no main lifestory');
  }),
}));

vi.mock('../../features/chat/components/ChatFirstInterface', () => ({
  ChatFirstInterface: () => null,
}));

vi.mock('./KnowledgeBaseCreator', () => ({
  KnowledgeBaseCreator: () => null,
}));

vi.mock('./LibraryLanding', () => ({
  LibraryLanding: () => <div data-testid="library-landing-stub" />,
}));

function renderReader() {
  return render(
    <MemoryRouter initialEntries={['/lorebook?book=demo-1']}>
      <LoreBook />
    </MemoryRouter>,
  );
}

describe('LoreBook reader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns to LoreBook Library from the cover after Read', async () => {
    renderReader();

    const back = await screen.findByRole('button', { name: 'Back to LoreBook Library' });
    fireEvent.click(back);

    expect(mockNavigate).toHaveBeenCalledWith('/lorebook/library', { replace: true });
  });

  it('returns to LoreBook Library from the reader chrome', async () => {
    renderReader();

    fireEvent.click(await screen.findByRole('button', { name: 'Begin Reading' }));

    await waitFor(() => {
      expect(screen.getByTestId('lorebook')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Back to LoreBook Library' })[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/lorebook/library', { replace: true });
  });
});
