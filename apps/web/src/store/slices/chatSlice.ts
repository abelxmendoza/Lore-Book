import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ChatState {
  /** Thread displayed in the chat UI (URL-driven / active pane). */
  activeThreadId: string | null;
  /** Sidebar / session selection — last thread the user opened. */
  currentThreadId: string | null;
  /** Last user-visible thread error (load-more, rename, delete, etc.). */
  lastError: string | null;
}

export const initialChatState: ChatState = {
  activeThreadId: null,
  currentThreadId: null,
  lastError: null,
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
    resetChatUi(state) {
      state.activeThreadId = null;
      state.currentThreadId = null;
      state.lastError = null;
    },
  },
});

export const {
  setActiveThreadId,
  setCurrentThreadId,
  setThreadError,
  clearThreadError,
  resetChatUi,
} = chatSlice.actions;

export const chatReducer = chatSlice.reducer;
