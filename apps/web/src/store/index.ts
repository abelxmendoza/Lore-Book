import { combineReducers, configureStore } from '@reduxjs/toolkit';

import { baseApi } from './api/baseApi';
import { authReducer } from './slices/authSlice';
import { runtimeReducer } from './slices/runtimeSlice';
import { composerReducer } from './slices/composerSlice';
import { chatReducer } from './slices/chatSlice';
import { selectionReducer } from './slices/selectionSlice';
import { uiReducer } from './slices/uiSlice';
// Register injected endpoints (side-effect imports) so their reducers/hooks
// and cache tags are available app-wide and to the legacy event bridge.
import './api/entitiesApi';
import './api/loreApi';
import './api/chatApi';
import './api/questsApi';

const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
  composer: composerReducer,
  chat: chatReducer,
  selection: selectionReducer,
  runtime: runtimeReducer,
  [baseApi.reducerPath]: baseApi.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * Build a fresh store instance. Used by the app singleton below and by tests
 * that need an isolated store (so RTK Query cache state doesn't leak between
 * test cases). `preloadedState` allows seeding slices for deterministic tests.
 */
export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState: preloadedState as never,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        // EntityData payloads can carry non-serializable bits (e.g. Date inside a
        // memory record). Keep the check on everywhere else.
        serializableCheck: {
          ignoredActions: ['selection/openEntity', 'selection/updateSelectedEntity'],
          ignoredPaths: ['selection.selectedEntity'],
        },
      }).concat(baseApi.middleware),
  });
}

export const store = makeStore();

import { registerAppStore } from './appStoreRef';
registerAppStore(store);

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
