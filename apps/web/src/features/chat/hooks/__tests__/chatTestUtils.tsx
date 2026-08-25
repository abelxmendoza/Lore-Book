import React from 'react';
import { Provider } from 'react-redux';
import { renderHook } from '@testing-library/react';
import { afterEach } from 'vitest';

import { makeStore } from '../../../../store';
import { useChatThreads } from '../useChatThreads';

/**
 * Renders useChatThreads inside an isolated Redux Provider (required since chat
 * slice migration). Auto-unmounts after the test: the boot effect's async
 * fetch/dispatch chain has no cleanup function, so a hook instance left mounted
 * across tests can resolve mid-run and pollute the next test's mocked fetch
 * calls and Redux state.
 */
export function renderUseChatThreads() {
  const store = makeStore();
  const hook = renderHook(() => useChatThreads(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
  afterEach(() => hook.unmount());
  return { store, ...hook };
}
