import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { makeStore } from '../../../store';
import { setComposerMatches } from '../../../store/slices/composerSlice';
import { useChatComposer } from './useChatComposer';

const analyze = vi.fn();
const mockMatches = vi.fn(() => [] as Array<Record<string, unknown>>);

vi.mock('../../../hooks/useMoodEngine', () => ({
  useMoodEngine: () => ({
    mood: { score: 0, color: '#fff', label: 'Neutral' },
    setScore: vi.fn(),
  }),
  localHeuristic: () => 0,
}));

vi.mock('../../../hooks/useAutoTagger', () => ({
  useAutoTagger: () => ({
    suggestions: [],
    refreshSuggestions: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useEntityIndexer', () => ({
  useEntityIndexer: () => ({
    matches: mockMatches(),
    analyze,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={makeStore()}>{children}</Provider>;
}

describe('useChatComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMatches.mockReturnValue([]);
  });

  it('analyzes input as the user types and clears on empty input', () => {
    const { result } = renderHook(() => useChatComposer(vi.fn()), { wrapper });

    act(() => {
      result.current.setInput('Tell me about Abel');
    });
    // analyze now receives the active threadId as a second arg (undefined here).
    expect(analyze).toHaveBeenCalledWith('Tell me about Abel', undefined);

    act(() => {
      result.current.setInput('');
    });
    expect(analyze).toHaveBeenCalledWith('');
  });

  it('passes visible matches to onSubmit and clears composer state', () => {
    const onSubmit = vi.fn();
    const match = {
      id: 'uuid-abel',
      name: 'Abel',
      type: 'character' as const,
      aliases: [],
      mentionKeys: ['abel'],
      status: 'confirmed' as const,
      matchedLabel: 'Abel',
    };
    mockMatches.mockReturnValue([match]);

    const store = makeStore();
    const localWrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    const { result } = renderHook(() => useChatComposer(onSubmit), { wrapper: localWrapper });

    act(() => {
      store.dispatch(setComposerMatches([match]));
      result.current.setInput('Tell me about Abel');
    });

    act(() => {
      result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith('Tell me about Abel', [match], []);
    expect(result.current.input).toBe('');
    expect(store.getState().composer.draftText).toBe('');
  });

  it('omits dismissed matches from submit payload', () => {
    const onSubmit = vi.fn();
    const match = {
      id: 'uuid-abel',
      name: 'Abel',
      type: 'character' as const,
      aliases: [],
      mentionKeys: ['abel'],
      status: 'confirmed' as const,
      matchedLabel: 'Abel',
    };
    mockMatches.mockReturnValue([match]);

    const store = makeStore();
    const localWrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    const { result } = renderHook(() => useChatComposer(onSubmit), { wrapper: localWrapper });

    act(() => {
      store.dispatch(setComposerMatches([match]));
      result.current.setInput('Abel');
      result.current.dismissMatch(match);
    });

    act(() => {
      result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith('Abel', [], []);
  });
});
