import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatComposer } from '../ChatComposer';
import { useMoodEngine } from '../../../hooks/useMoodEngine';
import { useAutoTagger } from '../../../hooks/useAutoTagger';
import { useCharacterIndexer } from '../../../hooks/useCharacterIndexer';

// Mock the hooks
vi.mock('../../../hooks/useMoodEngine');
vi.mock('../../../hooks/useAutoTagger');
vi.mock('../../../hooks/useCharacterIndexer');

// Mock fetchJson
vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

describe('ChatComposer - Debounced Mood Evaluation', () => {
  const mockEvaluate = vi.fn();
  const mockSetScore = vi.fn();
  const mockRefreshSuggestions = vi.fn();
  const mockAnalyze = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup mock mood engine
    (useMoodEngine as any).mockReturnValue({
      mood: { score: 0, color: '#ffffff', label: 'Neutral' },
      loading: false,
      evaluate: mockEvaluate,
      setScore: mockSetScore,
      intensity: 0,
    });

    // Setup mock auto tagger
    (useAutoTagger as any).mockReturnValue({
      suggestions: [],
      refreshSuggestions: mockRefreshSuggestions,
    });

    // Setup mock character indexer
    (useCharacterIndexer as any).mockReturnValue({
      matches: [],
      analyze: mockAnalyze,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce mood evaluation API calls', async () => {
    const user = userEvent.setup({ delay: null });
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ChatComposer
        input=""
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    const textarea = screen.getByPlaceholderText(/Message Lore Book/i);

    // Type multiple characters quickly
    await user.type(textarea, 'h');
    await user.type(textarea, 'e');
    await user.type(textarea, 'l');
    await user.type(textarea, 'l');
    await user.type(textarea, 'o');

    // Fast-forward time but not enough to trigger debounce
    vi.advanceTimersByTime(400);

    // Should not have called evaluate yet (debounce is 500ms)
    expect(mockEvaluate).not.toHaveBeenCalled();

    // Fast-forward past the debounce threshold
    vi.advanceTimersByTime(200);
    vi.runAllTimers();

    // Now it should have been called once
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    expect(mockEvaluate).toHaveBeenCalledWith('hello');
  }, 10000);

  it('should reset debounce timer on each keystroke', async () => {
    const user = userEvent.setup({ delay: null });
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ChatComposer
        input=""
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    const textarea = screen.getByPlaceholderText(/Message Lore Book/i);

    // Type 'h'
    await user.type(textarea, 'h');
    vi.advanceTimersByTime(400);

    // Type 'e' before debounce completes
    await user.type(textarea, 'e');
    vi.advanceTimersByTime(400);

    // Type 'l' before debounce completes
    await user.type(textarea, 'l');
    vi.advanceTimersByTime(500);
    vi.runAllTimers();

    // Should only be called once after the final debounce period
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    expect(mockEvaluate).toHaveBeenCalledWith('hel');
  }, 10000);

  it('should call non-API operations immediately', async () => {
    const user = userEvent.setup({ delay: null });
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ChatComposer
        input=""
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    const textarea = screen.getByPlaceholderText(/Message Lore Book/i);

    await user.type(textarea, 'test');
    vi.runAllTimers();

    // These should be called immediately (not debounced)
    expect(mockRefreshSuggestions).toHaveBeenCalled();
    expect(mockAnalyze).toHaveBeenCalled();
  }, 10000);

  it('should clear debounce timer on unmount', async () => {
    const user = userEvent.setup({ delay: null });
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    const { unmount } = render(
      <ChatComposer
        input=""
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    const textarea = screen.getByPlaceholderText(/Message Lore Book/i);
    await user.type(textarea, 'test');

    // Unmount before debounce completes
    unmount();
    vi.advanceTimersByTime(500);
    vi.runAllTimers();

    // Should not have called evaluate after unmount
    expect(mockEvaluate).not.toHaveBeenCalled();
  }, 10000);

  it('should reset mood score immediately when input is cleared', async () => {
    const user = userEvent.setup({ delay: null });
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <ChatComposer
        input="test"
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    // Clear input
    rerender(
      <ChatComposer
        input=""
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    // Should immediately reset score (not debounced)
    expect(mockSetScore).toHaveBeenCalledWith(0);
  });
});
