import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { EntityData } from '../../components/entity/EntityDetailModal';
import type { CurrentContext, SoulProfileContext } from '../../types/currentContext';

const defaultCurrentContext: CurrentContext = { kind: 'none' };

export interface SelectionState {
  /** Entity currently shown in the global entity modal. */
  selectedEntity: EntityData | null;
  /** Whether the global entity modal is open (kept separate so the close animation can run). */
  entityModalOpen: boolean;
  /** "Where the user is" — inferred from navigation, used by chat + retrieval. */
  currentContext: CurrentContext;
  /** Last non-`none` context, so we can restore intent after transient `none` states. */
  lastNonNoneContext: CurrentContext | null;
  /** Last surfaced Soul Profile insights, sent with chat for refinement. */
  soulProfileContext: SoulProfileContext | null;
}

const initialState: SelectionState = {
  selectedEntity: null,
  entityModalOpen: false,
  currentContext: defaultCurrentContext,
  lastNonNoneContext: null,
  soulProfileContext: null,
};

const selectionSlice = createSlice({
  name: 'selection',
  initialState,
  reducers: {
    openEntity(state, action: PayloadAction<EntityData>) {
      state.selectedEntity = action.payload as EntityData;
      state.entityModalOpen = true;
    },
    updateSelectedEntity(state, action: PayloadAction<EntityData>) {
      state.selectedEntity = state.selectedEntity
        ? ({ ...state.selectedEntity, ...action.payload } as EntityData)
        : (action.payload as EntityData);
    },
    closeEntityModal(state) {
      state.entityModalOpen = false;
    },
    clearSelectedEntity(state) {
      state.selectedEntity = null;
    },
    setCurrentContext(state, action: PayloadAction<CurrentContext>) {
      state.currentContext = action.payload;
      if (action.payload.kind !== 'none') {
        state.lastNonNoneContext = action.payload;
      }
    },
    setSoulProfileContext(state, action: PayloadAction<SoulProfileContext | null>) {
      state.soulProfileContext = action.payload;
    },
  },
});

export const {
  openEntity,
  updateSelectedEntity,
  closeEntityModal,
  clearSelectedEntity,
  setCurrentContext,
  setSoulProfileContext,
} = selectionSlice.actions;

export const selectionReducer = selectionSlice.reducer;
