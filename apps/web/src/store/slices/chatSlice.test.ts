import { describe, it, expect } from 'vitest';

import {
  chatReducer,
  setActiveThreadId,
  setCurrentThreadId,
  setThreadError,
  clearThreadError,
  pulseCharacterHighlights,
  resetChatUi,
  initialChatState,
} from './chatSlice';

describe('chatSlice', () => {
  it('tracks active and current thread ids independently', () => {
    let state = chatReducer(initialChatState, setActiveThreadId('active-1'));
    state = chatReducer(state, setCurrentThreadId('current-1'));
    expect(state.activeThreadId).toBe('active-1');
    expect(state.currentThreadId).toBe('current-1');
  });

  it('records and clears thread errors', () => {
    let state = chatReducer(initialChatState, setThreadError('Network down'));
    expect(state.lastError).toBe('Network down');
    state = chatReducer(state, clearThreadError());
    expect(state.lastError).toBeNull();
  });

  it('resetChatUi clears selection and errors', () => {
    let state = chatReducer(initialChatState, setActiveThreadId('a'));
    state = chatReducer(state, setCurrentThreadId('c'));
    state = chatReducer(state, setThreadError('oops'));
    state = chatReducer(state, pulseCharacterHighlights(['c1']));
    state = chatReducer(state, resetChatUi());
    expect(state).toEqual(initialChatState);
  });

  it('allows nulling thread ids explicitly', () => {
    let state = chatReducer(initialChatState, setActiveThreadId('a'));
    state = chatReducer(state, setActiveThreadId(null));
    expect(state.activeThreadId).toBeNull();
  });
});
