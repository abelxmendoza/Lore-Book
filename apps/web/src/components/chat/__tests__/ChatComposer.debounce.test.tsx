import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <ChatComposer
        input=""
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    // Simulate parent updating input (controlled component)
    rerender(
      <ChatComposer
        input="hello"
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    // Fast-forward time but not enough to trigger debounce (500ms)
    vi.advanceTimersByTime(400);
    expect(mockEvaluate).not.toHaveBeenCalled();

    // Fast-forward past the debounce threshold (callback runs synchronously; no waitFor with fake timers)
    vi.advanceTimersByTime(200);
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    expect(mockEvaluate).toHaveBeenCalledWith('hello');
  });

  it('should reset debounce timer on each keystroke', async () => {
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <ChatComposer
        input=""
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    // Simulate typing: h -> he -> hel with pauses shorter than 500ms
    rerender(<ChatComposer input="h" onInputChange={onInputChange} onSubmit={onSubmit} loading={false} />);
    vi.advanceTimersByTime(400);

    rerender(<ChatComposer input="he" onInputChange={onInputChange} onSubmit={onSubmit} loading={false} />);
    vi.advanceTimersByTime(400);

    rerender(<ChatComposer input="hel" onInputChange={onInputChange} onSubmit={onSubmit} loading={false} />);
    vi.advanceTimersByTime(500);
    vi.runAllTimers();

    // Should only be called once after the final debounce period
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    expect(mockEvaluate).toHaveBeenCalledWith('hel');
  });

  it('should call non-API operations immediately', async () => {
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <ChatComposer
        input=""
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    rerender(
      <ChatComposer
        input="test"
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    // Non-API operations (refreshSuggestions, analyze) run immediately in useEffect
    expect(mockRefreshSuggestions).toHaveBeenCalledWith('test');
    expect(mockAnalyze).toHaveBeenCalledWith('test');
  });

  it('should clear debounce timer on unmount', async () => {
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    const { rerender, unmount } = render(
      <ChatComposer
        input=""
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    rerender(
      <ChatComposer
        input="test"
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    // Unmount before 500ms debounce completes
    unmount();
    vi.advanceTimersByTime(500);
    vi.runAllTimers();

    // evaluate should not run after unmount (cleanup clears the timer)
    expect(mockEvaluate).not.toHaveBeenCalled();
  }, 10000);

  it('should reset mood score immediately when input is cleared', async () => {
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
