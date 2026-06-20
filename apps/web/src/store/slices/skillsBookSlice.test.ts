import { describe, it, expect } from 'vitest';

import {
  skillsBookReducer,
  initialSkillsBookState,
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
  SKILL_LEVEL_MIN,
  SKILL_LEVEL_MAX,
  SKILL_CONFIDENCE_MIN,
  SKILL_CONFIDENCE_MAX,
  SKILL_PROFICIENCY_MIN,
  SKILL_PROFICIENCY_MAX,
  type SkillsBookState,
} from './skillsBookSlice';

/** Build a state on top of the defaults for focused assertions. */
const stateWith = (overrides: Partial<SkillsBookState>): SkillsBookState => ({
  ...initialSkillsBookState,
  ...overrides,
});

describe('skillsBookSlice', () => {
  it('returns the initial state for an unknown action', () => {
    expect(skillsBookReducer(undefined, { type: '@@INIT' })).toEqual(initialSkillsBookState);
  });

  describe('search', () => {
    it('sets the search term', () => {
      const next = skillsBookReducer(initialSkillsBookState, setSearchTerm('guitar'));
      expect(next.searchTerm).toBe('guitar');
    });

    it('returns to page 1 whenever the search term changes', () => {
      const onPage4 = stateWith({ currentPage: 4 });
      expect(skillsBookReducer(onPage4, setSearchTerm('react')).currentPage).toBe(1);
    });

    it('coerces a nullish search payload to an empty string (error handling)', () => {
      const next = skillsBookReducer(
        initialSkillsBookState,
        // Simulate a malformed dispatch from non-typed callers.
        setSearchTerm(undefined as unknown as string)
      );
      expect(next.searchTerm).toBe('');
    });
  });

  describe('category + sort', () => {
    it('sets the active category and resets the page', () => {
      const onPage3 = stateWith({ currentPage: 3 });
      const next = skillsBookReducer(onPage3, setActiveCategory('technical_type'));
      expect(next.activeCategory).toBe('technical_type');
      expect(next.currentPage).toBe(1);
    });

    it('sets the sort option and resets the page', () => {
      const onPage2 = stateWith({ currentPage: 2 });
      const next = skillsBookReducer(onPage2, setSortBy('level_desc'));
      expect(next.sortBy).toBe('level_desc');
      expect(next.currentPage).toBe(1);
    });
  });

  describe('pagination', () => {
    it('sets an explicit page', () => {
      expect(skillsBookReducer(initialSkillsBookState, setCurrentPage(5)).currentPage).toBe(5);
    });

    it('floors and floors-to-1 invalid explicit pages (error handling)', () => {
      expect(skillsBookReducer(initialSkillsBookState, setCurrentPage(0)).currentPage).toBe(1);
      expect(skillsBookReducer(initialSkillsBookState, setCurrentPage(-3)).currentPage).toBe(1);
      expect(skillsBookReducer(initialSkillsBookState, setCurrentPage(3.9)).currentPage).toBe(3);
      expect(
        skillsBookReducer(initialSkillsBookState, setCurrentPage(NaN as unknown as number)).currentPage
      ).toBe(1);
    });

    it('advances to the next page but never past totalPages', () => {
      const onPage2 = stateWith({ currentPage: 2 });
      expect(skillsBookReducer(onPage2, goToNextPage(5)).currentPage).toBe(3);
      const onLast = stateWith({ currentPage: 5 });
      expect(skillsBookReducer(onLast, goToNextPage(5)).currentPage).toBe(5);
    });

    it('goes to the previous page but never below 1', () => {
      const onPage2 = stateWith({ currentPage: 2 });
      expect(skillsBookReducer(onPage2, goToPrevPage()).currentPage).toBe(1);
      expect(skillsBookReducer(initialSkillsBookState, goToPrevPage()).currentPage).toBe(1);
    });

    it('clamps the current page into [1, totalPages] when the list shrinks', () => {
      const onPage9 = stateWith({ currentPage: 9 });
      expect(skillsBookReducer(onPage9, clampCurrentPage(3)).currentPage).toBe(3);
    });

    it('treats a zero/negative totalPages as at least one page (error handling)', () => {
      const onPage4 = stateWith({ currentPage: 4 });
      expect(skillsBookReducer(onPage4, clampCurrentPage(0)).currentPage).toBe(1);
      expect(skillsBookReducer(onPage4, goToNextPage(-2)).currentPage).toBe(1);
    });
  });

  describe('advanced filters panel', () => {
    it('toggles the panel open and closed', () => {
      const opened = skillsBookReducer(initialSkillsBookState, toggleAdvancedFilters());
      expect(opened.showAdvancedFilters).toBe(true);
      expect(skillsBookReducer(opened, toggleAdvancedFilters()).showAdvancedFilters).toBe(false);
    });

    it('sets the panel to an explicit value', () => {
      expect(
        skillsBookReducer(initialSkillsBookState, setShowAdvancedFilters(true)).showAdvancedFilters
      ).toBe(true);
    });
  });

  describe('numeric filters', () => {
    it('clamps level bounds into the valid range and resets the page', () => {
      const onPage5 = stateWith({ currentPage: 5 });
      const minTooHigh = skillsBookReducer(onPage5, setFilterLevelMin(99));
      expect(minTooHigh.filterLevelMin).toBe(SKILL_LEVEL_MAX);
      expect(minTooHigh.currentPage).toBe(1);

      const maxTooLow = skillsBookReducer(initialSkillsBookState, setFilterLevelMax(-5));
      expect(maxTooLow.filterLevelMax).toBe(SKILL_LEVEL_MIN);
    });

    it('falls back to the bound default for NaN level input (empty number field)', () => {
      const next = skillsBookReducer(
        initialSkillsBookState,
        setFilterLevelMin(NaN as unknown as number)
      );
      expect(next.filterLevelMin).toBe(SKILL_LEVEL_MIN);
    });

    it('clamps confidence into [0, 1]', () => {
      expect(
        skillsBookReducer(initialSkillsBookState, setFilterConfidenceMin(-0.4)).filterConfidenceMin
      ).toBe(SKILL_CONFIDENCE_MIN);
      expect(
        skillsBookReducer(initialSkillsBookState, setFilterConfidenceMax(2.5)).filterConfidenceMax
      ).toBe(SKILL_CONFIDENCE_MAX);
    });

    it('clamps proficiency into [0, 100]', () => {
      expect(
        skillsBookReducer(initialSkillsBookState, setFilterProficiencyMin(250)).filterProficiencyMin
      ).toBe(SKILL_PROFICIENCY_MAX);
      expect(
        skillsBookReducer(initialSkillsBookState, setFilterProficiencyMin(-10)).filterProficiencyMin
      ).toBe(SKILL_PROFICIENCY_MIN);
    });
  });

  describe('reset', () => {
    it('restores every control back to the defaults', () => {
      const dirty = stateWith({
        searchTerm: 'piano',
        activeCategory: 'paid',
        sortBy: 'xp_desc',
        currentPage: 6,
        showAdvancedFilters: true,
        filterLevelMin: 4,
        filterProficiencyMin: 50,
      });
      expect(skillsBookReducer(dirty, resetSkillsFilters())).toEqual(initialSkillsBookState);
    });
  });

  it('never mutates the previous state (immutability)', () => {
    const frozen = Object.freeze({ ...initialSkillsBookState });
    expect(() => skillsBookReducer(frozen, setSearchTerm('x'))).not.toThrow();
    expect(frozen.searchTerm).toBe('');
  });
});
