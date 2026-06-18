import { describe, it, expect } from 'vitest';

import { baseApi } from './api/baseApi';
import { entitiesApi } from './api/entitiesApi';
import { questsApi } from './api/questsApi';
import { loreApi } from './api/loreApi';
import { setActiveSurface } from './slices/uiSlice';

import { makeStore, store } from './index';

describe('store wiring', () => {
  it('exposes the expected reducer slices', () => {
    const state = makeStore().getState();
    expect(state).toHaveProperty('auth');
    expect(state).toHaveProperty('ui');
    expect(state).toHaveProperty('selection');
    expect(state).toHaveProperty('runtime');
    expect(state).toHaveProperty('chat');
    expect(state).toHaveProperty(baseApi.reducerPath);
  });

  it('creates isolated stores (no shared mutable state)', () => {
    const a = makeStore();
    const b = makeStore();
    a.dispatch(setActiveSurface('timeline'));
    expect(a.getState().ui.activeSurface).toBe('timeline');
    expect(b.getState().ui.activeSurface).toBe('chat');
  });

  it('registers the injected API endpoints', () => {
    expect(entitiesApi.endpoints.getCharactersBook).toBeDefined();
    expect(questsApi.endpoints.getQuestsList).toBeDefined();
    expect(questsApi.endpoints.updateQuestProgress).toBeDefined();
    expect(loreApi.endpoints.getEntries).toBeDefined();
    expect(questsApi.endpoints.getQuestBoard).toBeDefined();
    expect(questsApi.endpoints.convertGoalToQuest).toBeDefined();
  });

  it('wires RTK Query middleware (dispatching a query thunk does not throw)', () => {
    const s = makeStore();
    expect(() => s.dispatch(questsApi.endpoints.getQuestsList.initiate())).not.toThrow();
  });

  it('exports a singleton app store', () => {
    expect(store).toBeDefined();
    expect(typeof store.dispatch).toBe('function');
  });
});
