import type { RootState } from './index';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const selectAuthUser = (state: RootState) => state.auth.user;
export const selectAuthSession = (state: RootState) => state.auth.session;
export const selectAuthLoading = (state: RootState) => state.auth.loading;
export const selectIsSupabaseConfigured = (state: RootState) => state.auth.isConfigured;
export const selectIsAuthenticated = (state: RootState) => state.auth.user != null;
export const selectAuthUserId = (state: RootState) => state.auth.user?.id ?? null;

// ─── UI ───────────────────────────────────────────────────────────────────────
export const selectActiveSurface = (state: RootState) => state.ui.activeSurface;
export const selectMobileDrawerOpen = (state: RootState) => state.ui.mobileDrawerOpen;
export const selectDevMode = (state: RootState) => state.ui.devMode;

// ─── Selection ──────────────────────────────────────────────────────────────────
export const selectSelectedEntity = (state: RootState) => state.selection.selectedEntity;
export const selectEntityModalOpen = (state: RootState) => state.selection.entityModalOpen;
export const selectCurrentContext = (state: RootState) => state.selection.currentContext;
export const selectLastNonNoneContext = (state: RootState) => state.selection.lastNonNoneContext;
export const selectSoulProfileContext = (state: RootState) => state.selection.soulProfileContext;

// ─── Runtime ──────────────────────────────────────────────────────────────────
export const selectUseMockData = (state: RootState) => state.runtime.useMockData;
/** Auth-gated mock flag — authenticated users never use mock data. */
export const selectEffectiveUseMockData = (state: RootState) =>
  state.auth.user ? false : state.runtime.useMockData;
export const selectIsMockDataActive = (state: RootState) => state.runtime.isMockDataActive;
export const selectBackendUnavailable = (state: RootState) => state.runtime.backendUnavailable;
export const selectBackendHealth = (state: RootState) => state.runtime.backendHealth;
export const selectIsGuest = (state: RootState) => state.runtime.isGuest;
export const selectRuntimeIdentity = (state: RootState) => state.runtime.runtimeIdentity;
export const selectRuntimeDataMode = (state: RootState) => state.runtime.runtimeDataMode;

/** True only for authenticated users on a healthy backend — safe for protected reads. */
export const selectIsRealUser = (state: RootState) => state.runtime.runtimeIdentity === 'REAL_USER';

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const selectActiveThreadId = (state: RootState) => state.chat.activeThreadId;
export const selectCurrentThreadId = (state: RootState) => state.chat.currentThreadId;
export const selectThreadError = (state: RootState) => state.chat.lastError;
export const selectHighlightedCharacterIds = (state: RootState) => state.chat.highlightedCharacterIds;
