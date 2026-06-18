/**
 * Current Context — shared notion of "where the user is"
 * Inferred from navigation only. Used by chat, UI, and retrieval.
 *
 * Backed by the Redux `selection` slice; this module keeps the original hook +
 * provider API so existing consumers don't change.
 */

import { useCallback, type ReactNode } from 'react';
import type { CurrentContext } from '../types/currentContext';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setCurrentContext as setCurrentContextAction } from '../store/slices/selectionSlice';

interface CurrentContextState {
  currentContext: CurrentContext;
  lastNonNoneContext: CurrentContext | null;
  setCurrentContext: (ctx: CurrentContext) => void;
  getBreadcrumbs: () => string[];
}

/** Passthrough — state now lives in the Redux store. Kept so the tree shape is stable. */
export function CurrentContextProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useCurrentContext(): CurrentContextState {
  const dispatch = useAppDispatch();
  const currentContext = useAppSelector((s) => s.selection.currentContext);
  const lastNonNoneContext = useAppSelector((s) => s.selection.lastNonNoneContext);

  const setCurrentContext = useCallback(
    (ctx: CurrentContext) => dispatch(setCurrentContextAction(ctx)),
    [dispatch]
  );

  const getBreadcrumbs = useCallback((): string[] => {
    if (currentContext.kind === 'none') return [];
    if (currentContext.kind === 'thread' && currentContext.threadId) {
      return ['Threads', currentContext.threadId];
    }
    if (
      currentContext.kind === 'timeline' &&
      currentContext.timelineNodeId &&
      currentContext.timelineLayer
    ) {
      return [currentContext.timelineLayer, currentContext.timelineNodeId];
    }
    return [];
  }, [currentContext]);

  return { currentContext, lastNonNoneContext, setCurrentContext, getBreadcrumbs };
}
