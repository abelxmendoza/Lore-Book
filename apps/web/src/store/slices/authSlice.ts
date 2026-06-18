import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthState {
  user: User | null;
  session: Session | null;
  /** True until the first session resolve (getSession or onAuthStateChange). */
  loading: boolean;
  isConfigured: boolean;
}

export const initialAuthState: AuthState = {
  user: null,
  session: null,
  loading: true,
  isConfigured: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,
  reducers: {
    setAuthConfigured(state, action: PayloadAction<boolean>) {
      state.isConfigured = action.payload;
    },
    setAuthSession(
      state,
      action: PayloadAction<{ user: User | null; session: Session | null }>,
    ) {
      state.user = action.payload.user;
      state.session = action.payload.session;
      state.loading = false;
    },
    setAuthLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    resetAuth(state) {
      Object.assign(state, initialAuthState);
      state.loading = false;
    },
  },
});

export const { setAuthConfigured, setAuthSession, setAuthLoading, resetAuth } = authSlice.actions;
export const authReducer = authSlice.reducer;
