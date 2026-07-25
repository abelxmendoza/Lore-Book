import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '../../test/utils';
import { MemoryExplorer } from './MemoryExplorer';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: vi.fn(() => true),
  shouldUseMockData: () => true,
}));

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: () => ({
    entries: [],
    chapters: [],
    refreshEntries: vi.fn(),
  }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({ entries: [] }),
}));

vi.mock('../discovery/MemoryReviewQueuePanel', () => ({
  MemoryReviewQueuePanel: () => <div data-testid="memory-review-queue">Review queue</div>,
}));

vi.mock('./MemoryDetailModal', () => ({
  MemoryDetailModal: () => null,
}));

describe('MemoryExplorer (Search facts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('lorebook.searchFacts.cardViewMode');
  });

  it('supports grid, list, and copy all', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<MemoryExplorer />);

    expect(await screen.findByTestId('search-facts-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy all/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /list view/i }));
    expect(screen.getByTestId('search-facts-list')).toBeInTheDocument();
    expect(screen.queryByTestId('search-facts-grid')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /grid view/i }));
    expect(screen.getByTestId('search-facts-grid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0]?.[0])).toContain('Search facts');
  });
});
