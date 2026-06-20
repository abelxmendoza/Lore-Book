import { createSelector } from '@reduxjs/toolkit';

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
export const selectChatFocus = (state: RootState) => state.selection.chatFocus;

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

// ─── Skills Book ────────────────────────────────────────────────────────────────
export const selectSkillsBookState = (state: RootState) => state.skillsBook;
export const selectSkillsBookSearchTerm = (state: RootState) => state.skillsBook.searchTerm;
export const selectSkillsBookActiveCategory = (state: RootState) => state.skillsBook.activeCategory;
export const selectSkillsBookSortBy = (state: RootState) => state.skillsBook.sortBy;
export const selectSkillsBookCurrentPage = (state: RootState) => state.skillsBook.currentPage;
export const selectSkillsBookShowAdvancedFilters = (state: RootState) =>
  state.skillsBook.showAdvancedFilters;
export const selectSkillsBookFilterLevelMin = (state: RootState) => state.skillsBook.filterLevelMin;
export const selectSkillsBookFilterLevelMax = (state: RootState) => state.skillsBook.filterLevelMax;
export const selectSkillsBookFilterConfidenceMin = (state: RootState) =>
  state.skillsBook.filterConfidenceMin;
export const selectSkillsBookFilterConfidenceMax = (state: RootState) =>
  state.skillsBook.filterConfidenceMax;
export const selectSkillsBookFilterProficiencyMin = (state: RootState) =>
  state.skillsBook.filterProficiencyMin;

/**
 * Memoized bundle of the numeric advanced filters. Kept as a single object so
 * the Skills Book filtering `useMemo` can depend on one stable reference
 * instead of five separate selector subscriptions.
 */
export const selectSkillsBookNumericFilters = createSelector(
  [
    selectSkillsBookFilterLevelMin,
    selectSkillsBookFilterLevelMax,
    selectSkillsBookFilterConfidenceMin,
    selectSkillsBookFilterConfidenceMax,
    selectSkillsBookFilterProficiencyMin,
  ],
  (filterLevelMin, filterLevelMax, filterConfidenceMin, filterConfidenceMax, filterProficiencyMin) => ({
    filterLevelMin,
    filterLevelMax,
    filterConfidenceMin,
    filterConfidenceMax,
    filterProficiencyMin,
  })
);

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const selectActiveThreadId = (state: RootState) => state.chat.activeThreadId;
export const selectCurrentThreadId = (state: RootState) => state.chat.currentThreadId;
export const selectThreadError = (state: RootState) => state.chat.lastError;
export const selectHighlightedCharacterIds = (state: RootState) => state.chat.highlightedCharacterIds;
