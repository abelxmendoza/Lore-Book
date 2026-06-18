/**
 * Soul Profile Chat Context — holds "last surfaced" Soul Profile insights for chat-driven refinement.
 * When the user views Soul Profile, we store those insights here so that when they send a message
 * from Chat, we can send soulProfileContext and improve insight resolution.
 *
 * Backed by the Redux `selection` slice. The provider is a passthrough now that
 * the Redux store is mounted at the app root.
 */

import { useCallback, type ReactNode } from 'react';
import type { SoulProfileContext } from '../types/currentContext';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSoulProfileContext as setSoulProfileContextAction } from '../store/slices/selectionSlice';

interface SoulProfileChatState {
  soulProfileContext: SoulProfileContext | null;
  setSoulProfileContext: (ctx: SoulProfileContext | null) => void;
}

/** Passthrough — state now lives in the Redux store. */
export function SoulProfileChatProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useSoulProfileChatContext(): SoulProfileChatState {
  const dispatch = useAppDispatch();
  const soulProfileContext = useAppSelector((s) => s.selection.soulProfileContext);
  const setSoulProfileContext = useCallback(
    (ctx: SoulProfileContext | null) => dispatch(setSoulProfileContextAction(ctx)),
    [dispatch]
  );
  return { soulProfileContext, setSoulProfileContext };
}

/**
 * Backwards-compatible optional accessor. The Redux store is always mounted at
 * the app root, so this resolves the same value as the required hook.
 */
export function useSoulProfileChatContextOptional(): SoulProfileChatState | null {
  return useSoulProfileChatContext();
}
