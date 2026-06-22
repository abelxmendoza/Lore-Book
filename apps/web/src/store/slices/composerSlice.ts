import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { CertifiedEntityMatch } from '../../lib/certifiedEntityMatch';

export type ComposerMatchSlot = `${CertifiedEntityMatch['type']}:${string}`;

export function composerMatchSlot(match: Pick<CertifiedEntityMatch, 'type' | 'id'>): ComposerMatchSlot {
  return `${match.type}:${match.id}`;
}

export interface ComposerState {
  /** Current draft in the chat textarea (for diagnostics / cross-panel sync). */
  draftText: string;
  /** Latest entity matches from certified index + typing analysis. */
  matches: CertifiedEntityMatch[];
  /** User-dismissed chips for the current draft (reappear on new typing). */
  dismissedSlots: ComposerMatchSlot[];
  /** Chips currently being confirmed (add to book). */
  confirmingSlots: ComposerMatchSlot[];
  /** Chips checked for inclusion when the message is sent. */
  includedSlots: ComposerMatchSlot[];
  indexReady: boolean;
  /** Non-fatal load failure for certified index (chips hidden, chat still works). */
  indexError: string | null;
}

const initialState: ComposerState = {
  draftText: '',
  matches: [],
  dismissedSlots: [],
  confirmingSlots: [],
  includedSlots: [],
  indexReady: false,
  indexError: null,
};

function defaultIncluded(match: CertifiedEntityMatch): boolean {
  if (match.matchKind === 'prefix') return false;
  return match.status === 'confirmed' || !match.status;
}

const composerSlice = createSlice({
  name: 'composer',
  initialState,
  reducers: {
    setComposerDraft(state, action: PayloadAction<string>) {
      state.draftText = action.payload;
      if (!action.payload.trim()) {
        state.matches = [];
        state.dismissedSlots = [];
        state.confirmingSlots = [];
        state.includedSlots = [];
      }
    },
    setComposerMatches(state, action: PayloadAction<CertifiedEntityMatch[]>) {
      state.matches = action.payload;
      const active = new Set(action.payload.map((m) => composerMatchSlot(m)));
      state.dismissedSlots = state.dismissedSlots.filter((slot) => active.has(slot));
      const prevIncluded = new Set(state.includedSlots);
      const nextIncluded: ComposerMatchSlot[] = [];
      for (const m of action.payload) {
        const slot = composerMatchSlot(m);
        if (state.dismissedSlots.includes(slot)) continue;
        if (prevIncluded.has(slot) || defaultIncluded(m)) {
          nextIncluded.push(slot);
        }
      }
      state.includedSlots = nextIncluded;
    },
    setComposerIndexReady(state, action: PayloadAction<boolean>) {
      state.indexReady = action.payload;
      if (action.payload) state.indexError = null;
    },
    setComposerIndexError(state, action: PayloadAction<string | null>) {
      state.indexError = action.payload;
      if (action.payload) {
        state.indexReady = false;
        state.matches = [];
      }
    },
    dismissComposerMatch(state, action: PayloadAction<ComposerMatchSlot>) {
      if (!state.dismissedSlots.includes(action.payload)) {
        state.dismissedSlots.push(action.payload);
      }
    },
    setComposerConfirming(state, action: PayloadAction<ComposerMatchSlot[]>) {
      state.confirmingSlots = action.payload;
    },
    addComposerConfirming(state, action: PayloadAction<ComposerMatchSlot>) {
      if (!state.confirmingSlots.includes(action.payload)) {
        state.confirmingSlots.push(action.payload);
      }
    },
    removeComposerConfirming(state, action: PayloadAction<ComposerMatchSlot>) {
      state.confirmingSlots = state.confirmingSlots.filter((slot) => slot !== action.payload);
    },
    toggleComposerIncluded(state, action: PayloadAction<ComposerMatchSlot>) {
      const slot = action.payload;
      if (state.includedSlots.includes(slot)) {
        state.includedSlots = state.includedSlots.filter((s) => s !== slot);
      } else {
        state.includedSlots.push(slot);
      }
    },
    clearComposerState(state) {
      state.draftText = '';
      state.matches = [];
      state.dismissedSlots = [];
      state.confirmingSlots = [];
      state.includedSlots = [];
    },
  },
});

export const {
  setComposerDraft,
  setComposerMatches,
  setComposerIndexReady,
  setComposerIndexError,
  dismissComposerMatch,
  setComposerConfirming,
  addComposerConfirming,
  removeComposerConfirming,
  toggleComposerIncluded,
  clearComposerState,
} = composerSlice.actions;

export const composerReducer = composerSlice.reducer;
