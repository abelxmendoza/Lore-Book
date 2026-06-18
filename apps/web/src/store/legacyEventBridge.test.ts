import { describe, it, expect, vi, afterEach } from 'vitest';

import { bindLegacyEntityEvents } from './legacyEventBridge';

import type { AppDispatch } from './index';

interface CapturedAction {
  type: string;
  payload?: unknown;
}

function captureDispatch() {
  const actions: CapturedAction[] = [];
  const dispatch = ((action: CapturedAction) => {
    actions.push(action);
    return action;
  }) as unknown as AppDispatch;
  return { actions, dispatch };
}

describe('legacyEventBridge', () => {
  let unbind: (() => void) | undefined;

  afterEach(() => {
    unbind?.();
    unbind = undefined;
  });

  it('invalidates the Character tag on lk:characters-updated', () => {
    const { actions, dispatch } = captureDispatch();
    unbind = bindLegacyEntityEvents(dispatch);

    window.dispatchEvent(new Event('lk:characters-updated'));

    expect(actions).toContainEqual(
      expect.objectContaining({ type: 'api/invalidateTags', payload: ['Character'] })
    );
  });

  it('maps each legacy event to the right tags', () => {
    const { actions, dispatch } = captureDispatch();
    unbind = bindLegacyEntityEvents(dispatch);

    window.dispatchEvent(new Event('lk:quests-updated'));
    window.dispatchEvent(new Event('lk:locations-updated'));
    window.dispatchEvent(new Event('lk:romantic-relationships-updated'));

    expect(actions.map((a) => a.payload)).toEqual(
      expect.arrayContaining([['Quest'], ['Location'], ['Character']])
    );
  });

  it('fans out story-data-updated to all entity tags', () => {
    const { actions, dispatch } = captureDispatch();
    unbind = bindLegacyEntityEvents(dispatch);

    window.dispatchEvent(new Event('lk:story-data-updated'));

    const payload = actions.find((a) => a.type === 'api/invalidateTags')?.payload as string[];
    expect(payload).toEqual(expect.arrayContaining(['Story', 'Character', 'Quest', 'Timeline']));
  });

  it('stops dispatching after cleanup', () => {
    const { actions, dispatch } = captureDispatch();
    const cleanup = bindLegacyEntityEvents(dispatch);
    cleanup();

    window.dispatchEvent(new Event('lk:characters-updated'));
    expect(actions).toHaveLength(0);
  });

  it('does not double-bind while already bound', () => {
    const first = captureDispatch();
    unbind = bindLegacyEntityEvents(first.dispatch);
    // Second bind should be a no-op while the first is active.
    const second = captureDispatch();
    const secondCleanup = bindLegacyEntityEvents(second.dispatch);

    window.dispatchEvent(new Event('lk:characters-updated'));

    expect(first.actions).toHaveLength(1);
    expect(second.actions).toHaveLength(0);
    secondCleanup();
  });

  it('never throws if dispatch fails', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwingDispatch = (() => {
      throw new Error('dispatch failed');
    }) as unknown as AppDispatch;
    unbind = bindLegacyEntityEvents(throwingDispatch);

    expect(() => window.dispatchEvent(new Event('lk:characters-updated'))).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
