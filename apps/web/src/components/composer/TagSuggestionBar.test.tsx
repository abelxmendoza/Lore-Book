import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/utils';
import { TagSuggestionBar } from './TagSuggestionBar';
import * as entriesApi from '../../api/entries';

// Mock the API
vi.mock('../../api/entries', () => ({
  suggestTags: vi.fn()
}));

describe('TagSuggestionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when content is empty', () => {
    const { container } = render(<TagSuggestionBar content="" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows loading state while fetching suggestions', async () => {
    // Make the promise take longer so we can see the loading state
    vi.mocked(entriesApi.suggestTags).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(['tag1', 'tag2']), 1000))
    );

    render(<TagSuggestionBar content="This is a test entry with some content" />);
    
    // Wait for debounce (500ms) + a bit more to see loading state
    await waitFor(() => {
      expect(screen.getByText('Suggesting tags...')).toBeInTheDocument();
    }, { timeout: 800 });
  });

  it('displays suggested tags after loading', async () => {
    vi.mocked(entriesApi.suggestTags).mockResolvedValue(['tag1', 'tag2', 'tag3']);

    render(<TagSuggestionBar content="This is a test entry with some content" />);
    
    await waitFor(() => {
      expect(screen.getByText('#tag1')).toBeInTheDocument();
      expect(screen.getByText('#tag2')).toBeInTheDocument();
    });
  });

  it('calls onTagSelect when tag is clicked', async () => {
    const onTagSelect = vi.fn();
    vi.mocked(entriesApi.suggestTags).mockResolvedValue(['tag1', 'tag2']);

    render(
      <TagSuggestionBar 
        content="Test content" 
        onTagSelect={onTagSelect}
      />
    );

    await waitFor(() => {
      const tag = screen.getByText('#tag1');
      tag.click();
      expect(onTagSelect).toHaveBeenCalledWith('tag1');
    });
  });

  it('does not fetch suggestions for short content', async () => {
    vi.mocked(entriesApi.suggestTags).mockResolvedValue([]);

    render(<TagSuggestionBar content="Short" />);
    
    await waitFor(() => {
      expect(entriesApi.suggestTags).not.toHaveBeenCalled();
    });
  });
});

