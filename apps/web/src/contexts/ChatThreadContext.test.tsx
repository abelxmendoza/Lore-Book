import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';

vi.mock('../features/chat/hooks/useChatThreads', () => ({
  useChatThreads: () => ({
    threads: [{ id: 't1', title: 'One', messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: new Date() }], updatedAt: new Date().toISOString() }],
    threadsLoading: false,
    threadsReady: true,
    threadsHasMore: false,
    threadsTotal: 1,
    threadsLoadingMore: false,
    loadMoreThreads: vi.fn(),
    currentThreadId: null,
    setCurrentThreadId: vi.fn(),
    createThread: vi.fn(),
    getThread: (id: string) =>
      id === 't1'
        ? { id: 't1', title: 'One', messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: new Date() }], updatedAt: new Date().toISOString() }
        : undefined,
    hydrateThreadMessages: vi.fn(),
    switchThread: vi.fn(),
    updateThread: vi.fn(),
    mutateThreadMessages: vi.fn(),
    renameThread: vi.fn(),
    deleteThread: vi.fn(),
    flushSave: vi.fn(),
    loadThreads: vi.fn(),
    lastError: null,
    dismissThreadError: vi.fn(),
  }),
}));

import { ChatThreadProvider, useChatThreadContext } from './ChatThreadContext';
import { makeStore } from '../store';
import { selectActiveThreadId } from '../store/selectors';
import { setActiveThreadId } from '../store/slices/chatSlice';

function ActiveConsumer() {
  const { activeThreadId, setActiveThreadId, activeMessages } = useChatThreadContext();
  return (
    <div>
      <span data-testid="active-id">{activeThreadId ?? 'none'}</span>
      <span data-testid="msg-count">{activeMessages.length}</span>
      <button type="button" onClick={() => setActiveThreadId('t1')}>
        activate
      </button>
      <button type="button" onClick={() => setActiveThreadId(null)}>
        clear
      </button>
    </div>
  );
}

describe('ChatThreadProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads and writes activeThreadId through the Redux chat slice', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatThreadProvider>
          <ActiveConsumer />
        </ChatThreadProvider>
      </Provider>
    );

    expect(screen.getByTestId('active-id').textContent).toBe('none');
    expect(selectActiveThreadId(store.getState())).toBeNull();

    fireEvent.click(screen.getByText('activate'));
    expect(screen.getByTestId('active-id').textContent).toBe('t1');
    expect(selectActiveThreadId(store.getState())).toBe('t1');
    expect(screen.getByTestId('msg-count').textContent).toBe('1');

    fireEvent.click(screen.getByText('clear'));
    expect(selectActiveThreadId(store.getState())).toBeNull();
  });

  it('reflects external slice updates in context consumers', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatThreadProvider>
          <ActiveConsumer />
        </ChatThreadProvider>
      </Provider>
    );

    act(() => {
      store.dispatch(setActiveThreadId('t1'));
    });
    expect(screen.getByTestId('active-id').textContent).toBe('t1');
  });
});
