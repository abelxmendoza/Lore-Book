import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { SurfaceKey } from '../../utils/routeMapping';

export interface UiState {
  /** The active app surface (chat, timeline, characters, …). Synced with the route. */
  activeSurface: SurfaceKey;
  /** Mobile navigation drawer open/closed. */
  mobileDrawerOpen: boolean;
  /** Developer diagnostics panel toggle (non-production only). */
  devMode: boolean;
}

const initialState: UiState = {
  activeSurface: 'chat',
  mobileDrawerOpen: false,
  devMode: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setActiveSurface(state, action: PayloadAction<SurfaceKey>) {
      state.activeSurface = action.payload;
    },
    openMobileDrawer(state) {
      state.mobileDrawerOpen = true;
    },
    closeMobileDrawer(state) {
      state.mobileDrawerOpen = false;
    },
    setMobileDrawerOpen(state, action: PayloadAction<boolean>) {
      state.mobileDrawerOpen = action.payload;
    },
    toggleDevMode(state) {
      state.devMode = !state.devMode;
    },
    setDevMode(state, action: PayloadAction<boolean>) {
      state.devMode = action.payload;
    },
  },
});

export const {
  setActiveSurface,
  openMobileDrawer,
  closeMobileDrawer,
  setMobileDrawerOpen,
  toggleDevMode,
  setDevMode,
} = uiSlice.actions;

export const uiReducer = uiSlice.reducer;
