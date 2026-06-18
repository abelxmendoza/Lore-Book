import { useEffect, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import { bindRuntimeAccess } from './runtimeAccess';
import { bindSupabaseAuth } from './authSync';
import { bindLegacyEntityEvents } from './legacyEventBridge';

import { store } from './index';

/**
 * App-wide Redux provider. Wraps the tree with the single shared store so both
 * the application (main.tsx) and tests (test/utils.tsx) use the same instance.
 * Also bridges the legacy `lk:*-updated` window-event bus into RTK Query cache
 * invalidations for the duration of the migration.
 */
export function ReduxProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    bindLegacyEntityEvents(store.dispatch);
    bindRuntimeAccess();
    return bindSupabaseAuth(store.dispatch);
  }, []);
  return <Provider store={store}>{children}</Provider>;
}
