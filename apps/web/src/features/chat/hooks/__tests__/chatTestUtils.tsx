import React from 'react';
import { Provider } from 'react-redux';
import { renderHook } from '@testing-library/react';

import { makeStore } from '../../../../store';
import { useChatThreads } from '../useChatThreads';

/** Renders useChatThreads inside an isolated Redux Provider (required since chat slice migration). */
export function renderUseChatThreads() {
  const store = makeStore();
  const hook = renderHook(() => useChatThreads(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
  return { store, ...hook };
}
