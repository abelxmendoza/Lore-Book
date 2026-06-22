import { createSelector } from '@reduxjs/toolkit';

import { composerMatchSlot } from '../slices/composerSlice';
import type { RootState } from '../index';

export const selectComposerDraft = (state: RootState) => state.composer.draftText;
export const selectComposerMatches = (state: RootState) => state.composer.matches;
export const selectComposerIndexReady = (state: RootState) => state.composer.indexReady;

export const selectVisibleComposerMatches = createSelector(
  [selectComposerMatches, (state: RootState) => state.composer.dismissedSlots],
  (matches, dismissed) => {
    if (dismissed.length === 0) return matches;
    const hidden = new Set(dismissed);
    return matches.filter((m) => !hidden.has(composerMatchSlot(m)));
  }
);

export const selectComposerMatchCounts = createSelector(selectVisibleComposerMatches, (matches) => ({
  total: matches.length,
  confirmed: matches.filter((m) => m.status === 'confirmed' || !m.status).length,
  suggested: matches.filter((m) => m.status === 'suggestion').length,
  draft: matches.filter((m) => m.status === 'draft').length,
  prefix: matches.filter((m) => m.matchKind === 'prefix').length,
}));

export const selectComposerConfirmingSlots = (state: RootState) => state.composer.confirmingSlots;
export const selectComposerIncludedSlots = (state: RootState) => state.composer.includedSlots;
