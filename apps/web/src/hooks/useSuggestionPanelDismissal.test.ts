import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSuggestionPanelDismissal } from './useSuggestionPanelDismissal';

describe('useSuggestionPanelDismissal', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('hides panel after dismiss when empty', () => {
    const { result, rerender } = renderHook(
      ({ count }) => useSuggestionPanelDismissal('skills', count),
      { initialProps: { count: 0 } },
    );

    expect(result.current.isEmpty).toBe(true);
    expect(result.current.hidePanel).toBe(false);

    act(() => result.current.dismissEmptyPanel());
    rerender({ count: 0 });

    expect(result.current.hidePanel).toBe(true);
    expect(sessionStorage.getItem('lk:suggestion-panel-dismissed:skills')).toBe('1');
  });

  it('reopens when new suggestions arrive', () => {
    const { result, rerender } = renderHook(
      ({ count }) => useSuggestionPanelDismissal('skills', count),
      { initialProps: { count: 0 } },
    );

    act(() => result.current.dismissEmptyPanel());
    rerender({ count: 0 });
    expect(result.current.hidePanel).toBe(true);

    rerender({ count: 2 });
    expect(result.current.hidePanel).toBe(false);
    expect(sessionStorage.getItem('lk:suggestion-panel-dismissed:skills')).toBeNull();
  });

  it('reopens when reopenPanel is called', () => {
    const { result } = renderHook(() => useSuggestionPanelDismissal('quests', 0));

    act(() => result.current.dismissEmptyPanel());
    expect(result.current.hidePanel).toBe(true);

    act(() => result.current.reopenPanel());
    expect(result.current.hidePanel).toBe(false);
  });
});
