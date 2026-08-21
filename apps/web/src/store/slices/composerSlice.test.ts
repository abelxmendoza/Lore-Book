import { describe, it, expect } from 'vitest';

import {
  composerReducer,
  clearComposerState,
  dismissComposerMatch,
  setComposerDraft,
  setComposerHasDraft,
  setComposerIndexError,
  setComposerMatches,
  type ComposerState,
} from './composerSlice';
import { selectComposerMatchCounts, selectVisibleComposerMatches } from '../selectors/composerSelectors';
import { makeStore } from '../index';

const initial: ComposerState = {
  draftText: '',
  hasDraft: false,
  matches: [],
  dismissedSlots: [],
  confirmingSlots: [],
  includedSlots: [],
  indexReady: false,
  indexError: null,
};

const sampleMatch = {
  id: 'uuid-abel',
  name: 'Abel',
  type: 'character' as const,
  aliases: [],
  mentionKeys: ['abel'],
  status: 'confirmed' as const,
  matchedLabel: 'Abel',
  matchKind: 'full' as const,
};

describe('composerSlice', () => {
  it('setComposerHasDraft is a no-op when occupancy does not change', () => {
    let state = composerReducer(initial, setComposerHasDraft(false));
    expect(state.hasDraft).toBe(false);
    state = composerReducer(state, setComposerHasDraft(true));
    expect(state.hasDraft).toBe(true);
    const same = composerReducer(state, setComposerHasDraft(true));
    expect(same).toBe(state);
  });

  it('tracks draft text and clears on empty draft', () => {
    let state = composerReducer(initial, setComposerDraft('hello'));
    expect(state.draftText).toBe('hello');
    expect(state.hasDraft).toBe(true);
    state = composerReducer(state, setComposerDraft(''));
    expect(state.matches).toEqual([]);
    expect(state.dismissedSlots).toEqual([]);
    expect(state.hasDraft).toBe(false);
  });

  it('stores matches and clears dismissed slots that are no longer active', () => {
    let state = composerReducer(initial, setComposerMatches([sampleMatch]));
    state = composerReducer(state, dismissComposerMatch('character:uuid-abel'));
    expect(state.dismissedSlots).toEqual(['character:uuid-abel']);
    state = composerReducer(state, setComposerMatches([]));
    expect(state.dismissedSlots).toEqual([]);
  });

  it('clearComposerState resets draft and matches', () => {
    let state = composerReducer(initial, setComposerDraft('draft'));
    state = composerReducer(state, setComposerMatches([sampleMatch]));
    state = composerReducer(state, clearComposerState());
    expect(state).toEqual(initial);
  });

  it('records index errors and clears matches', () => {
    let state = composerReducer(initial, setComposerMatches([sampleMatch]));
    state = composerReducer(state, setComposerIndexError('offline'));
    expect(state.indexError).toBe('offline');
    expect(state.indexReady).toBe(false);
    expect(state.matches).toEqual([]);
  });
});

describe('composerSelectors', () => {
  it('filters dismissed matches and counts by status', () => {
    const store = makeStore({
      composer: {
        draftText: 'Abel',
        hasDraft: true,
        matches: [sampleMatch, { ...sampleMatch, id: 'sug:character:kelly', name: 'Kelly', status: 'suggestion' }],
        dismissedSlots: ['character:uuid-abel'],
        confirmingSlots: [],
        includedSlots: [],
        indexReady: true,
        indexError: null,
      },
    });

    expect(selectVisibleComposerMatches(store.getState()).map((m) => m.name)).toEqual(['Kelly']);
    expect(selectComposerMatchCounts(store.getState())).toEqual({
      total: 1,
      confirmed: 0,
      suggested: 1,
      draft: 0,
      prefix: 0,
    });
  });
});
