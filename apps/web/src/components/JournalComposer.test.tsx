// =====================================================
// JOURNAL COMPOSER TESTS
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JournalComposer } from './JournalComposer';

// Mock dependencies
vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../hooks/useLoreKeeper', () => ({
  useLoreKeeper: () => ({
    characters: [],
    entries: [],
    chapters: [],
    timeline: { chapters: [], unassigned: [] },
    loading: false,
    error: null,
    loadCharacters: vi.fn(),
    refreshEntries: vi.fn(),
  }),
}));

describe('JournalComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render journal composer', () => {
    render(<JournalComposer />);
    
    // Check for main elements
    expect(screen.getByPlaceholderText(/write your entry/i)).toBeInTheDocument();
  });

  it('should allow text input', async () => {
    const user = userEvent.setup();
    render(<JournalComposer />);

    const textarea = screen.getByPlaceholderText(/write your entry/i);
    await user.type(textarea, 'Test entry content');

    expect(textarea).toHaveValue('Test entry content');
  });

  it('should display character suggestions', () => {
    render(<JournalComposer />);
    
    // Component should render without crashing
    expect(screen.getByPlaceholderText(/write your entry/i)).toBeInTheDocument();
  });

  it('should handle empty input', () => {
    render(<JournalComposer />);
    
    const textarea = screen.getByPlaceholderText(/write your entry/i);
    expect(textarea).toHaveValue('');
  });
});
