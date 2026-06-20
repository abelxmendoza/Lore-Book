import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { SkillCategory } from '../../types/skill';

/**
 * View/filter state for the Skills Book surface (search, category, sort,
 * pagination, advanced numeric filters). Lifted out of component-local
 * `useState` into Redux so the mobile-responsive Skills Book has a single,
 * testable source of truth that survives remounts and is shared across the
 * search bar, category tabs, sort control and pagination footer.
 */
export type SkillCategoryFilter =
  | 'all'
  | SkillCategory
  | 'recent'
  | 'high_level'
  | 'low_level'
  | 'active'
  | 'inactive'
  | 'auto_detected'
  | 'paid'
  | 'hobby'
  | 'improving'
  | 'high_proficiency'
  | 'physical_type'
  | 'technical_type';

export type SkillSortOption =
  | 'name_asc'
  | 'name_desc'
  | 'level_desc'
  | 'level_asc'
  | 'xp_desc'
  | 'xp_asc'
  | 'practice_desc'
  | 'practice_asc'
  | 'recent';

export const SKILL_LEVEL_MIN = 1;
export const SKILL_LEVEL_MAX = 20;
export const SKILL_CONFIDENCE_MIN = 0;
export const SKILL_CONFIDENCE_MAX = 1;
export const SKILL_PROFICIENCY_MIN = 0;
export const SKILL_PROFICIENCY_MAX = 100;

export interface SkillsBookState {
  searchTerm: string;
  activeCategory: SkillCategoryFilter;
  sortBy: SkillSortOption;
  currentPage: number;
  showAdvancedFilters: boolean;
  filterLevelMin: number;
  filterLevelMax: number;
  filterConfidenceMin: number;
  filterConfidenceMax: number;
  filterProficiencyMin: number;
}

export const initialSkillsBookState: SkillsBookState = {
  searchTerm: '',
  activeCategory: 'all',
  sortBy: 'name_asc',
  currentPage: 1,
  showAdvancedFilters: false,
  filterLevelMin: SKILL_LEVEL_MIN,
  filterLevelMax: SKILL_LEVEL_MAX,
  filterConfidenceMin: SKILL_CONFIDENCE_MIN,
  filterConfidenceMax: SKILL_CONFIDENCE_MAX,
  filterProficiencyMin: SKILL_PROFICIENCY_MIN,
};

/** Clamp a value to an inclusive [min, max] range. */
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Coerce a possibly-invalid numeric input (e.g. `parseInt('')` → NaN, or a
 * raw `Infinity`) back to a safe fallback. Filter inputs come straight from
 * `<input type="number">`, which yields NaN for empty/partial values.
 */
const safeNumber = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

/** Normalize an incoming page number to a positive integer (≥ 1). */
const normalizePage = (value: number): number =>
  Math.max(1, Math.floor(safeNumber(value, 1)));

/** Normalize a total-page count to a positive integer (≥ 1). */
const normalizeTotalPages = (value: number): number =>
  Math.max(1, Math.floor(safeNumber(value, 1)));

const skillsBookSlice = createSlice({
  name: 'skillsBook',
  initialState: initialSkillsBookState,
  reducers: {
    setSearchTerm(state, action: PayloadAction<string>) {
      state.searchTerm = action.payload ?? '';
      // Any change that alters the result set returns the user to page 1.
      state.currentPage = 1;
    },
    setActiveCategory(state, action: PayloadAction<SkillCategoryFilter>) {
      state.activeCategory = action.payload;
      state.currentPage = 1;
    },
    setSortBy(state, action: PayloadAction<SkillSortOption>) {
      state.sortBy = action.payload;
      state.currentPage = 1;
    },
    setCurrentPage(state, action: PayloadAction<number>) {
      state.currentPage = normalizePage(action.payload);
    },
    goToNextPage(state, action: PayloadAction<number>) {
      const totalPages = normalizeTotalPages(action.payload);
      state.currentPage = Math.min(totalPages, state.currentPage + 1);
    },
    goToPrevPage(state) {
      state.currentPage = Math.max(1, state.currentPage - 1);
    },
    /** Keep the current page within [1, totalPages] after the list size changes. */
    clampCurrentPage(state, action: PayloadAction<number>) {
      const totalPages = normalizeTotalPages(action.payload);
      state.currentPage = clamp(state.currentPage, 1, totalPages);
    },
    toggleAdvancedFilters(state) {
      state.showAdvancedFilters = !state.showAdvancedFilters;
    },
    setShowAdvancedFilters(state, action: PayloadAction<boolean>) {
      state.showAdvancedFilters = action.payload;
    },
    setFilterLevelMin(state, action: PayloadAction<number>) {
      state.filterLevelMin = clamp(
        safeNumber(action.payload, SKILL_LEVEL_MIN),
        SKILL_LEVEL_MIN,
        SKILL_LEVEL_MAX
      );
      state.currentPage = 1;
    },
    setFilterLevelMax(state, action: PayloadAction<number>) {
      state.filterLevelMax = clamp(
        safeNumber(action.payload, SKILL_LEVEL_MAX),
        SKILL_LEVEL_MIN,
        SKILL_LEVEL_MAX
      );
      state.currentPage = 1;
    },
    setFilterConfidenceMin(state, action: PayloadAction<number>) {
      state.filterConfidenceMin = clamp(
        safeNumber(action.payload, SKILL_CONFIDENCE_MIN),
        SKILL_CONFIDENCE_MIN,
        SKILL_CONFIDENCE_MAX
      );
      state.currentPage = 1;
    },
    setFilterConfidenceMax(state, action: PayloadAction<number>) {
      state.filterConfidenceMax = clamp(
        safeNumber(action.payload, SKILL_CONFIDENCE_MAX),
        SKILL_CONFIDENCE_MIN,
        SKILL_CONFIDENCE_MAX
      );
      state.currentPage = 1;
    },
    setFilterProficiencyMin(state, action: PayloadAction<number>) {
      state.filterProficiencyMin = clamp(
        safeNumber(action.payload, SKILL_PROFICIENCY_MIN),
        SKILL_PROFICIENCY_MIN,
        SKILL_PROFICIENCY_MAX
      );
      state.currentPage = 1;
    },
    /** Reset every filter/view control back to defaults (the "Clear all" path). */
    resetSkillsFilters() {
      return initialSkillsBookState;
    },
  },
});

export const {
  setSearchTerm,
  setActiveCategory,
  setSortBy,
  setCurrentPage,
  goToNextPage,
  goToPrevPage,
  clampCurrentPage,
  toggleAdvancedFilters,
  setShowAdvancedFilters,
  setFilterLevelMin,
  setFilterLevelMax,
  setFilterConfidenceMin,
  setFilterConfidenceMax,
  setFilterProficiencyMin,
  resetSkillsFilters,
} = skillsBookSlice.actions;

export const skillsBookReducer = skillsBookSlice.reducer;
