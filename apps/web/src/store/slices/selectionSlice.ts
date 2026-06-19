import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { EntityData } from '../../components/entity/EntityDetailModal';
import type { CurrentContext, SoulProfileContext } from '../../types/currentContext';
import type { ChatFocus } from '../../types/chatFocus';
import {
  computeChatFocusMessageDelta,
  emptyChatFocusSessionStats,
  isEmotionalChatMessage,
} from '../../types/chatFocus';

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
  /** Active modal → chat focus (entity, source section, session deepening stats). */
  chatFocus: ChatFocus | null;
}

const initialState: SelectionState = {
  selectedEntity: null,
  entityModalOpen: false,
  currentContext: defaultCurrentContext,
  lastNonNoneContext: null,
  soulProfileContext: null,
  chatFocus: null,
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
    setChatFocus(state, action: PayloadAction<ChatFocus | null>) {
      if (!action.payload) {
        state.chatFocus = null;
        return;
      }
      state.chatFocus = {
        ...action.payload,
        arrivedAt: action.payload.arrivedAt ?? Date.now(),
        statBumpKey: action.payload.statBumpKey ?? 0,
      };
    },
    clearChatFocus(state) {
      state.chatFocus = null;
    },
    recordChatFocusMessage(state, action: PayloadAction<{ message: string }>) {
      if (!state.chatFocus) return;
      const emotional = isEmotionalChatMessage(action.payload.message);
      const { connectionDelta, affectionDelta } = computeChatFocusMessageDelta(
        state.chatFocus,
        action.payload.message.length,
        emotional
      );
      state.chatFocus.sessionStats.messagesSent += 1;
      state.chatFocus.sessionStats.connectionDelta += connectionDelta;
      state.chatFocus.sessionStats.affectionDelta += affectionDelta;
      state.chatFocus.sessionStats.lastUpdatedAt = new Date().toISOString();
      state.chatFocus.statBumpKey = (state.chatFocus.statBumpKey ?? 0) + 1;
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
  setChatFocus,
  clearChatFocus,
  recordChatFocusMessage,
} = selectionSlice.actions;

export { emptyChatFocusSessionStats };

export const selectionReducer = selectionSlice.reducer;
