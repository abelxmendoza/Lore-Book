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
    window.localStorage.clear();
  });

  it('does not leak an unsent draft between composers with different threadIds', () => {
    // Regression: embedded composers (character/location/entity modals) that
    // omit threadId all fall back to the same 'new-thread' draft-storage key,
    // so typing in one and reopening a different one shows the leftover text.
    const { result: characterA, unmount: unmountA } = renderHook(
      () => useChatComposer(vi.fn(), null, { threadId: 'character-chat:a' }),
      { wrapper },
    );
    act(() => {
      characterA.current.setInput('unsent note about Alice');
    });
    unmountA();

    const { result: characterB } = renderHook(
      () => useChatComposer(vi.fn(), null, { threadId: 'character-chat:b' }),
      { wrapper },
    );
    expect(characterB.current.input).toBe('');
  });

  it('still recovers its own unsent draft when reopened with the same threadId', () => {
    const { result: first, unmount: unmountFirst } = renderHook(
      () => useChatComposer(vi.fn(), null, { threadId: 'character-chat:a' }),
      { wrapper },
    );
    act(() => {
      first.current.setInput('unsent note about Alice');
    });
    unmountFirst();

    const { result: reopened } = renderHook(
      () => useChatComposer(vi.fn(), null, { threadId: 'character-chat:a' }),
      { wrapper },
    );
    expect(reopened.current.input).toBe('unsent note about Alice');
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

    expect(onSubmit).toHaveBeenCalledWith('Tell me about Abel', [match], [], undefined);
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

    expect(onSubmit).toHaveBeenCalledWith('Abel', [], [], undefined);
  });
});
