import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LibraryLanding } from './LibraryLanding';

const mockNavigate = vi.fn();
const focusEntityId = '22222222-2222-4222-8222-222222222222';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../hooks/useLoreReadiness', () => ({
  useLoreReadiness: () => ({
    readiness: {
      knowledgeScore: 72,
      overallProgress: 0.72,
      overallLevel: 'building',
      canGenerateAnyBook: true,
      readyTopicCount: 2,
      stats: {
        totalNarrativeAtoms: 14,
        totalChatMessages: 142,
        entityCounts: { characters: 4, locations: 3, events: 8, skills: 2 },
      },
      topics: [],
    },
    compiledBooks: [{ id: 'compiled-1', title: 'Test Book', created_at: '2025-01-01', chapterCount: 3 }],
    loading: false,
    refresh: async () => {},
    hasCompiledBook: true,
    isSimulated: false,
  }),
}));

vi.mock('../../hooks/useQueryReadiness', () => ({
  useQueryReadiness: () => ({
    evaluation: {
      canGenerate: true,
      progress: 0.8,
      level: 'ready',
      atomCount: 12,
      entryCount: 8,
      wordCount: 2400,
      estimatedPages: 6,
      gaps: [],
      suggestions: [],
    },
    loading: false,
  }),
}));

vi.mock('../../hooks/useEntitySearch', () => ({
  useEntitySearch: ({ query }: { query: string }) => ({
    results: query.toLowerCase().includes('mar')
      ? [{
          entityId: '22222222-2222-4222-8222-222222222222',
          entityType: 'person',
          displayName: 'Marcus',
          aliases: ['Marcus Vale'],
          knownStatus: 'known',
          confidence: 1,
          source: 'characters',
          matchKind: 'fuzzy',
        }]
      : [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../contexts/MockDataContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/MockDataContext')>(
    '../../contexts/MockDataContext'
  );
  return {
    ...actual,
    getGlobalMockDataEnabled: () => false,
  };
});

vi.mock('../../features/chat/components/LoreReadinessQuestChips', () => ({
  LoreReadinessQuestChips: () => null,
}));

// LibraryLanding calls useNavigate(), so it must render inside a Router
const render: typeof rtlRender = (ui, options) =>
  rtlRender(<MemoryRouter>{ui}</MemoryRouter>, options);

describe('LibraryLanding', () => {
  const mockOnGenerate = vi.fn();
  const mockOnReadBook = vi.fn();
  const mockOnEditBook = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(
      <LibraryLanding onGenerate={mockOnGenerate} />
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders all category buttons', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    // Each category button renders its label text inside a div — use getByText
    // rather than getByRole because the button's computed accessible name in jsdom
    // includes the description div (not hidden without CSS), making role queries fragile.
    expect(screen.getByText('Full Biography')).toBeInTheDocument();
    expect(screen.getByText('A Person')).toBeInTheDocument();
    expect(screen.getByText('Career')).toBeInTheDocument();
    expect(screen.getByText('Relationship')).toBeInTheDocument();
  });

  it('renders a query input', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('opens evidence review then compiles on confirm', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'my journey with music' } });

    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(screen.getByTestId('lorebook-evidence-review')).toBeInTheDocument();
    expect(mockOnGenerate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /compile this book/i }));
    expect(mockOnGenerate).toHaveBeenCalledWith('my journey with music', undefined);
  });

  it('picking a length from the tier menu opens evidence review and compiles with that form', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'my journey with music' } });

    fireEvent.click(screen.getByTestId('library-search-tier-menu').querySelector('button')!);
    const bookSelect = await screen.findByTestId('library-search-tier-menu-modal-select-book');
    fireEvent.click(bookSelect);

    expect(screen.getByTestId('lorebook-evidence-review')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /compile this book/i }));
    expect(mockOnGenerate).toHaveBeenCalledWith('my journey with music', { form: 'book' });
  });

  it('pre-fills query when a category is clicked', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const careerBtn = screen.getByRole('button', { name: /Career/i });
    fireEvent.click(careerBtn);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('my career with @');
    });
  });

  it('autocompletes an @ person and compiles against the exact entity id', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    fireEvent.click(screen.getByRole('button', { name: /A Person/i }));

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'my story with @mar' } });

    fireEvent.click(await screen.findByRole('option', { name: /Marcus/i }));
    expect(input.value).toBe('my story with @Marcus');
    expect(screen.getByText(/Focused on Marcus/i)).toBeInTheDocument();
    expect(screen.getByTestId('lorebook-focus-capacity')).toHaveTextContent('12 linked memories');
    expect(screen.getByTestId('lorebook-focus-capacity')).toHaveTextContent('8 source entries');
    expect(screen.getByTestId('lorebook-focus-capacity')).toHaveTextContent('2,400 words');
    expect(screen.getByTestId('lorebook-focus-capacity')).toHaveTextContent(/Longest unlocked: Epic · ~6 pages/i);

    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getByRole('button', { name: /compile this book/i }));

    expect(mockOnGenerate).toHaveBeenCalledWith('my story with @Marcus', {
      focusEntity: {
        id: focusEntityId,
        type: 'person',
        name: 'Marcus',
      },
    });
  });

  it('opens autocomplete when @ is typed directly without choosing a focus card', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'write about @mar' } });

    expect(await screen.findByRole('option', { name: /Marcus/i })).toBeInTheDocument();
  });

  it('opens evidence review via Enter, then compiles on confirm', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'the story of my first job' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(mockOnGenerate).not.toHaveBeenCalled();
    expect(screen.getByTestId('lorebook-evidence-review')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /compile this book/i }));
    expect(mockOnGenerate).toHaveBeenCalledWith('the story of my first job', undefined);
  });

  it('does not open review when query is empty', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const reviewBtn = screen.getByRole('button', { name: /review/i });
    expect(reviewBtn).toBeDisabled();
    fireEvent.click(reviewBtn);
    expect(mockOnGenerate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('lorebook-evidence-review')).not.toBeInTheDocument();
  });

  it('renders compiled books when onReadBook is provided', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} onReadBook={mockOnReadBook} onEditBook={mockOnEditBook} />);
    expect(screen.getAllByText('Test Book').length).toBeGreaterThan(0);
  });

  it('calls onReadBook when Read is clicked on a compiled book', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} onReadBook={mockOnReadBook} onEditBook={mockOnEditBook} />);
    const readBtn = screen.getAllByRole('button', { name: /^Read$/i })[0];
    fireEvent.click(readBtn);
    await waitFor(() => {
      expect(mockOnReadBook).toHaveBeenCalledWith('compiled-1');
    });
  });

  it('calls onEditBook when Edit is clicked on a compiled book', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} onReadBook={mockOnReadBook} onEditBook={mockOnEditBook} />);
    const editBtn = screen.getAllByRole('button', { name: /^Edit$/i })[0];
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(mockOnEditBook).toHaveBeenCalledWith('compiled-1');
    });
  });

  it('navigates to lorebook library when Enter LoreBook Library is clicked', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    fireEvent.click(screen.getByRole('button', { name: /enter lorebook library/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/lorebook/library');
  });
});
