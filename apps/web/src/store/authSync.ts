import type { Session } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

import type { AppDispatch } from './index';
import { setAuthConfigured, setAuthLoading, setAuthSession } from './slices/authSlice';

let bound = false;
let unsubscribe: (() => void) | null = null;

function applySession(dispatch: AppDispatch, session: Session | null) {
  const user = session?.user ?? null;
  dispatch(setAuthSession({ user, session }));
}

/**
 * Subscribe once to Supabase auth and mirror session/user into the auth slice.
 * Called from ReduxProvider on mount; idempotent for the app singleton store.
 */
export function bindSupabaseAuth(dispatch: AppDispatch): () => void {
  if (bound) return () => {};

  bound = true;
  dispatch(setAuthConfigured(isSupabaseConfigured()));

  if (!isSupabaseConfigured()) {
    dispatch(setAuthSession({ user: null, session: null }));
    return () => {
      bound = false;
    };
  }

  dispatch(setAuthLoading(true));

  void supabase.auth.getSession().then(({ data: { session } }) => {
    applySession(dispatch, session);
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    applySession(dispatch, session);
  });

  unsubscribe = () => {
    subscription.unsubscribe();
    bound = false;
    unsubscribe = null;
  };

  return unsubscribe;
}

/** Test-only helper to allow re-binding in isolated store scenarios. */
export function resetAuthBindingForTests() {
  unsubscribe?.();
  bound = false;
  unsubscribe = null;
}
