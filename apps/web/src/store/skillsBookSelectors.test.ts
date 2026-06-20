import { describe, it, expect } from 'vitest';

import { makeStore } from './index';
import {
  selectSkillsBookState,
  selectSkillsBookSearchTerm,
  selectSkillsBookActiveCategory,
  selectSkillsBookSortBy,
  selectSkillsBookCurrentPage,
  selectSkillsBookShowAdvancedFilters,
  selectSkillsBookFilterLevelMin,
  selectSkillsBookFilterLevelMax,
  selectSkillsBookFilterProficiencyMin,
  selectSkillsBookNumericFilters,
} from './selectors';
import {
  setSearchTerm,
  setActiveCategory,
  setSortBy,
  setCurrentPage,
  toggleAdvancedFilters,
  setFilterLevelMin,
  setFilterProficiencyMin,
  initialSkillsBookState,
} from './slices/skillsBookSlice';

describe('skillsBook selectors', () => {
  it('reads default field values from a fresh store', () => {
    const state = makeStore().getState();
    expect(selectSkillsBookState(state)).toEqual(initialSkillsBookState);
    expect(selectSkillsBookSearchTerm(state)).toBe('');
    expect(selectSkillsBookActiveCategory(state)).toBe('all');
    expect(selectSkillsBookSortBy(state)).toBe('name_asc');
    expect(selectSkillsBookCurrentPage(state)).toBe(1);
    expect(selectSkillsBookShowAdvancedFilters(state)).toBe(false);
    expect(selectSkillsBookFilterLevelMin(state)).toBe(1);
    expect(selectSkillsBookFilterLevelMax(state)).toBe(20);
    expect(selectSkillsBookFilterProficiencyMin(state)).toBe(0);
  });

  it('reflects dispatched changes', () => {
    const store = makeStore();
    store.dispatch(setSearchTerm('yoga'));
    store.dispatch(setActiveCategory('active'));
    store.dispatch(setSortBy('level_desc'));
    store.dispatch(setCurrentPage(3));
    store.dispatch(toggleAdvancedFilters());
    store.dispatch(setFilterLevelMin(4));
    store.dispatch(setFilterProficiencyMin(60));

    const state = store.getState();
    expect(selectSkillsBookSearchTerm(state)).toBe('yoga');
    expect(selectSkillsBookActiveCategory(state)).toBe('active');
    expect(selectSkillsBookSortBy(state)).toBe('level_desc');
    // setCurrentPage(3) then a later filter change resets the page back to 1.
    expect(selectSkillsBookCurrentPage(state)).toBe(1);
    expect(selectSkillsBookShowAdvancedFilters(state)).toBe(true);
    expect(selectSkillsBookFilterLevelMin(state)).toBe(4);
    expect(selectSkillsBookFilterProficiencyMin(state)).toBe(60);
  });

  describe('selectSkillsBookNumericFilters (memoized)', () => {
    it('bundles the five numeric filters', () => {
      const state = makeStore().getState();
      expect(selectSkillsBookNumericFilters(state)).toEqual({
        filterLevelMin: 1,
        filterLevelMax: 20,
        filterConfidenceMin: 0,
        filterConfidenceMax: 1,
        filterProficiencyMin: 0,
      });
    });

    it('returns a stable reference when unrelated state changes', () => {
      const store = makeStore();
      const first = selectSkillsBookNumericFilters(store.getState());

      // A non-numeric-filter change must not produce a new filters object.
      store.dispatch(setSearchTerm('changed'));
      const second = selectSkillsBookNumericFilters(store.getState());
      expect(second).toBe(first);

      // A numeric-filter change recomputes the bundle.
      store.dispatch(setFilterLevelMin(5));
      const third = selectSkillsBookNumericFilters(store.getState());
      expect(third).not.toBe(first);
      expect(third.filterLevelMin).toBe(5);
    });
  });
});
