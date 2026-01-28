/**
 * Soul Profile Chat Context — holds "last surfaced" Soul Profile insights for chat-driven refinement.
 * When the user views Soul Profile, we store those insights here so that when they send a message
 * from Chat, we can send soulProfileContext and improve insight resolution.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { SoulProfileContext } from '../types/currentContext';

interface SoulProfileChatState {
  soulProfileContext: SoulProfileContext | null;
  setSoulProfileContext: (ctx: SoulProfileContext | null) => void;
}

const SoulProfileChatContext = createContext<SoulProfileChatState | undefined>(undefined);

export function SoulProfileChatProvider({ children }: { children: ReactNode }) {
  const [soulProfileContext, setSoulProfileContextState] = useState<SoulProfileContext | null>(null);

  const setSoulProfileContext = useCallback((ctx: SoulProfileContext | null) => {
    setSoulProfileContextState(ctx);
  }, []);

  return (
    <SoulProfileChatContext.Provider
      value={{
        soulProfileContext,
        setSoulProfileContext,
      }}
    >
      {children}
    </SoulProfileChatContext.Provider>
  );
}

export function useSoulProfileChatContext(): SoulProfileChatState {
  const ctx = useContext(SoulProfileChatContext);
  if (!ctx) {
    throw new Error('useSoulProfileChatContext must be used within SoulProfileChatProvider');
  }
  return ctx;
}

/**
 * Optional hook — returns null if provider is missing (e.g. in tests).
 * Use when callers may render outside SoulProfileChatProvider.
 */
export function useSoulProfileChatContextOptional(): SoulProfileChatState | null {
  return useContext(SoulProfileChatContext) ?? null;
}
