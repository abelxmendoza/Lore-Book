/**
 * Current Context — shared notion of "where the user is"
 * Inferred from navigation only. Used by chat, UI, and retrieval.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { CurrentContext } from '../types/currentContext';

const defaultContext: CurrentContext = { kind: 'none' };

interface CurrentContextState {
  currentContext: CurrentContext;
  lastNonNoneContext: CurrentContext | null;
  setCurrentContext: (ctx: CurrentContext) => void;
  getBreadcrumbs: () => string[];
}

const CurrentContextContext = createContext<CurrentContextState | undefined>(undefined);

export function CurrentContextProvider({ children }: { children: ReactNode }) {
  const [currentContext, setCurrentContextState] = useState<CurrentContext>(defaultContext);
  const [lastNonNoneContext, setLastNonNoneContext] = useState<CurrentContext | null>(null);

  const setCurrentContext = useCallback((ctx: CurrentContext) => {
    setCurrentContextState(ctx);
    if (ctx.kind !== 'none') {
      setLastNonNoneContext(ctx);
    }
  }, []);

  const getBreadcrumbs = useCallback((): string[] => {
    if (currentContext.kind === 'none') return [];
    if (currentContext.kind === 'thread' && currentContext.threadId) {
      return ['Threads', currentContext.threadId]; // Name resolved async elsewhere if needed
    }
    if (currentContext.kind === 'timeline' && currentContext.timelineNodeId && currentContext.timelineLayer) {
      return [currentContext.timelineLayer, currentContext.timelineNodeId]; // Titles resolved async elsewhere if needed
    }
    return [];
  }, [currentContext]);

  return (
    <CurrentContextContext.Provider
      value={{
        currentContext,
        lastNonNoneContext,
        setCurrentContext,
        getBreadcrumbs,
      }}
    >
      {children}
    </CurrentContextContext.Provider>
  );
}

export function useCurrentContext(): CurrentContextState {
  const ctx = useContext(CurrentContextContext);
  if (!ctx) {
    throw new Error('useCurrentContext must be used within CurrentContextProvider');
  }
  return ctx;
}
