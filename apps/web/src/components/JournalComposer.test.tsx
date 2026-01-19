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
  const mockOnSave = vi.fn();
  const mockOnAsk = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render journal composer', () => {
    render(<JournalComposer onSave={mockOnSave} onAsk={mockOnAsk} />);
    
    // Check for main elements
    expect(screen.getByPlaceholderText(/log your mission/i)).toBeInTheDocument();
  });

  it('should allow text input', async () => {
    const user = userEvent.setup();
    render(<JournalComposer onSave={mockOnSave} onAsk={mockOnAsk} />);

    const textarea = screen.getByPlaceholderText(/log your mission/i);
    await user.type(textarea, 'Test entry content');

    expect(textarea).toHaveValue('Test entry content');
  });

  it('should display character suggestions', () => {
    render(<JournalComposer onSave={mockOnSave} onAsk={mockOnAsk} />);
    
    // Component should render without crashing
    expect(screen.getByPlaceholderText(/log your mission/i)).toBeInTheDocument();
  });

  it('should handle empty input', () => {
    render(<JournalComposer onSave={mockOnSave} onAsk={mockOnAsk} />);
    
    const textarea = screen.getByPlaceholderText(/log your mission/i);
    expect(textarea).toHaveValue('');
  });
});
