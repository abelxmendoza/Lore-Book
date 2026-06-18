import { describe, it, expect } from 'vitest';

import {
  uiReducer,
  setActiveSurface,
  openMobileDrawer,
  closeMobileDrawer,
  setMobileDrawerOpen,
  toggleDevMode,
  setDevMode,
  type UiState,
} from './uiSlice';

const initial: UiState = {
  activeSurface: 'chat',
  mobileDrawerOpen: false,
  devMode: false,
};

describe('uiSlice', () => {
  it('returns the initial state', () => {
    expect(uiReducer(undefined, { type: '@@INIT' })).toEqual(initial);
  });

  it('sets the active surface', () => {
    const next = uiReducer(initial, setActiveSurface('timeline'));
    expect(next.activeSurface).toBe('timeline');
  });

  it('opens and closes the mobile drawer', () => {
    const opened = uiReducer(initial, openMobileDrawer());
    expect(opened.mobileDrawerOpen).toBe(true);
    const closed = uiReducer(opened, closeMobileDrawer());
    expect(closed.mobileDrawerOpen).toBe(false);
  });

  it('sets the mobile drawer to an explicit value', () => {
    expect(uiReducer(initial, setMobileDrawerOpen(true)).mobileDrawerOpen).toBe(true);
    expect(uiReducer(initial, setMobileDrawerOpen(false)).mobileDrawerOpen).toBe(false);
  });

  it('toggles dev mode', () => {
    const on = uiReducer(initial, toggleDevMode());
    expect(on.devMode).toBe(true);
    const off = uiReducer(on, toggleDevMode());
    expect(off.devMode).toBe(false);
  });

  it('sets dev mode explicitly', () => {
    expect(uiReducer(initial, setDevMode(true)).devMode).toBe(true);
  });

  it('does not mutate the previous state (immutability)', () => {
    const frozen = Object.freeze({ ...initial });
    expect(() => uiReducer(frozen, setActiveSurface('characters'))).not.toThrow();
    expect(frozen.activeSurface).toBe('chat');
  });
});
