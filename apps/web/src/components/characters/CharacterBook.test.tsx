import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CharacterBook } from './CharacterBook';
import { useLoreKeeper } from '../../../hooks/useLoreKeeper';

vi.mock('../../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: vi.fn()
}));

describe('CharacterBook', () => {
  const mockUseLoreKeeper = vi.mocked(useLoreKeeper);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLoreKeeper.mockReturnValue({
      characters: [],
      entries: [],
      chapters: [],
      timeline: { chapters: [], unassigned: [] },
      loading: false,
      error: null,
      loadCharacters: vi.fn(),
      refreshEntries: vi.fn(),
      refreshTimeline: vi.fn(),
      refreshChapters: vi.fn()
    } as any);
  });

  it('should render empty state when no characters', () => {
    render(<CharacterBook />);
    expect(screen.getByText(/Character Book/i)).toBeInTheDocument();
  });

  it('should render characters when available', async () => {
    const mockCharacters = [
      {
        id: '1',
        name: 'Test Character',
        role: 'Friend',
        archetype: 'ally',
        summary: 'Test summary'
      }
    ];

    mockUseLoreKeeper.mockReturnValue({
      characters: mockCharacters,
      entries: [],
      chapters: [],
      timeline: { chapters: [], unassigned: [] },
      loading: false,
      error: null,
      loadCharacters: vi.fn(),
      refreshEntries: vi.fn(),
      refreshTimeline: vi.fn(),
      refreshChapters: vi.fn()
    } as any);

    render(<CharacterBook />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Character')).toBeInTheDocument();
    });
  });

  it('should show loading state', () => {
    mockUseLoreKeeper.mockReturnValue({
      characters: [],
      entries: [],
      chapters: [],
      timeline: { chapters: [], unassigned: [] },
      loading: true,
      error: null,
      loadCharacters: vi.fn(),
      refreshEntries: vi.fn(),
      refreshTimeline: vi.fn(),
      refreshChapters: vi.fn()
    } as any);

    render(<CharacterBook />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

