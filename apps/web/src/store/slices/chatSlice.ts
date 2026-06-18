import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ChatState {
  /** Thread displayed in the chat UI (URL-driven / active pane). */
  activeThreadId: string | null;
  /** Sidebar / session selection — last thread the user opened. */
  currentThreadId: string | null;
  /** Last user-visible thread error (load-more, rename, delete, etc.). */
  lastError: string | null;
  /** Character ids to briefly highlight after chat-driven lore updates. */
  highlightedCharacterIds: string[];
}

export const initialChatState: ChatState = {
  activeThreadId: null,
  currentThreadId: null,
  lastError: null,
  highlightedCharacterIds: [],
};

const chatSlice = createSlice({
  name: 'chat',
  initialState: initialChatState,
  reducers: {
    setActiveThreadId(state, action: PayloadAction<string | null>) {
      state.activeThreadId = action.payload;
    },
    setCurrentThreadId(state, action: PayloadAction<string | null>) {
      state.currentThreadId = action.payload;
    },
    setThreadError(state, action: PayloadAction<string | null>) {
      state.lastError = action.payload;
    },
    clearThreadError(state) {
      state.lastError = null;
    },
    pulseCharacterHighlights(state, action: PayloadAction<string[]>) {
      state.highlightedCharacterIds = action.payload;
    },
    clearCharacterHighlights(state) {
      state.highlightedCharacterIds = [];
    },
    resetChatUi(state) {
      state.activeThreadId = null;
      state.currentThreadId = null;
      state.lastError = null;
      state.highlightedCharacterIds = [];
    },
  },
});

export const {
  setActiveThreadId,
  setCurrentThreadId,
  setThreadError,
  clearThreadError,
  pulseCharacterHighlights,
  clearCharacterHighlights,
  resetChatUi,
} = chatSlice.actions;

export const chatReducer = chatSlice.reducer;
