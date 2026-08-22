import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { makeStore } from '../../../store';
import { setComposerMatches } from '../../../store/slices/composerSlice';
import {
  clearDemoSession,
  demoThreadStorageUserId,
  enterDemoRuntime,
} from '../../../lib/demoRuntime';
import { preserveStoryAttempt, saveComposerDraft } from '../services/storySafetyVault';
import { COMPOSER_DRAFT_PERSIST_DEBOUNCE_MS, COMPOSER_LOCAL_IDLE_DEBOUNCE_MS, useChatComposer } from './useChatComposer';

const analyze = vi.fn();
const mockMatches = vi.fn(() => [] as Array<Record<string, unknown>>);
const mockUseAuth = vi.fn(() => ({ user: null as { id: string } | null }));

vi.mock('../../../lib/supabase', () => ({
  useAuth: () => mockUseAuth(),
}));

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
    abortInFlightPreview: vi.fn(),
    primeDraft: vi.fn(),
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={makeStore()}>{children}</Provider>;
}

describe('useChatComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMatches.mockReturnValue([]);
    mockUseAuth.mockReturnValue({ user: null });
    clearDemoSession();
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
  });

  afterEach(() => {
    clearDemoSession();
    window.history.replaceState({}, '', '/');
    vi.useRealTimers();
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

  it('does not restore an authenticated user draft on /demo', () => {
    const realUserId = 'user-private-lore-1';
    const privateDraft =
      'well its been on my mind alot and the showcase must never show this draft';
    mockUseAuth.mockReturnValue({ user: { id: realUserId } });
    saveComposerDraft(realUserId, undefined, privateDraft);

    window.history.replaceState({}, '', '/demo');
    enterDemoRuntime();

    const { result } = renderHook(() => useChatComposer(vi.fn()), { wrapper });
    expect(result.current.input).toBe('');

    // Typing in demo must write under the demo namespace, never the real account key.
    act(() => {
      result.current.setInput('demo-only note');
    });
    act(() => {
      result.current.handleComposerBlur();
    });
    expect(window.localStorage.getItem(
      `lorekeeper.composerDraft.v1:${realUserId}:new-thread`,
    )).toBe(privateDraft);
    expect(window.localStorage.getItem(
      `lorekeeper.composerDraft.v1:${demoThreadStorageUserId()}:new-thread`,
    )).toBe('demo-only note');
  });

  it('analyzes input after a short idle and clears on empty input', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChatComposer(vi.fn()), { wrapper });
    analyze.mockClear();

    act(() => {
      result.current.setInput('Tell me about Abel');
    });
    expect(analyze).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(COMPOSER_LOCAL_IDLE_DEBOUNCE_MS);
    });
    expect(analyze).toHaveBeenCalledWith('Tell me about Abel', undefined, 'lightweight');

    act(() => {
      result.current.setInput('');
    });
    expect(analyze).toHaveBeenCalledWith('');
    vi.useRealTimers();
  });

  it('does not persist a draft on every keystroke', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChatComposer(vi.fn()), { wrapper });

    act(() => {
      result.current.setInput('M');
      result.current.setInput('Ma');
      result.current.setInput('Maya');
    });
    expect(window.localStorage.getItem('lorekeeper.composerDraft.v1:guest-or-anonymous:new-thread')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(COMPOSER_DRAFT_PERSIST_DEBOUNCE_MS);
    });
    expect(window.localStorage.getItem('lorekeeper.composerDraft.v1:guest-or-anonymous:new-thread')).toBe('Maya');
    vi.useRealTimers();
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

  it('keeps the composer empty after submit even if a vault attempt still exists when threadId changes', () => {
    // Regression: send clears the box, then activeThreadId updates while the
    // vault still holds the in-flight attempt — that must not re-fill the field.
    const onSubmit = vi.fn();
    const story =
      'I bought a mic and recorded two songs for the show. This is a repeated story.';

    preserveStoryAttempt({
      id: 'attempt-inflight',
      ownerId: 'guest-or-anonymous',
      threadId: 'thread-after-send',
      text: story,
      createdAt: new Date().toISOString(),
    });

    const { result, rerender } = renderHook(
      ({ threadId }: { threadId?: string }) => useChatComposer(onSubmit, null, { threadId }),
      { wrapper, initialProps: { threadId: 'thread-before-send' } },
    );

    act(() => {
      result.current.setInput(story);
    });
    act(() => {
      result.current.handleSubmit();
    });
    expect(result.current.input).toBe('');

    rerender({ threadId: 'thread-after-send' });
    expect(result.current.input).toBe('');
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
