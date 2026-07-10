import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '../../../store';
import { useChatComposer } from './useChatComposer';

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
    matches: [],
    analyze: vi.fn(),
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={makeStore()}>{children}</Provider>;
}

describe('useChatComposer submitOnEnter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits on Enter when submitOnEnter is true', () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(
      () => useChatComposer(onSubmit, null, { submitOnEnter: true }),
      { wrapper },
    );

    act(() => {
      result.current.setInput('Hello');
    });

    const prevented = vi.fn();
    act(() => {
      result.current.handleKeyDown({
        key: 'Enter',
        shiftKey: false,
        preventDefault: prevented,
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
    });

    expect(prevented).toHaveBeenCalled();
    // onSubmit(text, entities, previewCorrections)
    expect(onSubmit).toHaveBeenCalledWith('Hello', [], [], undefined);
  });

  it('does not submit on Enter when submitOnEnter is false (mobile journal mode)', () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(
      () => useChatComposer(onSubmit, null, { submitOnEnter: false }),
      { wrapper },
    );

    act(() => {
      result.current.setInput('Line one');
    });

    const prevented = vi.fn();
    act(() => {
      result.current.handleKeyDown({
        key: 'Enter',
        shiftKey: false,
        preventDefault: prevented,
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
    });

    expect(prevented).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.input).toBe('Line one');
  });
});
