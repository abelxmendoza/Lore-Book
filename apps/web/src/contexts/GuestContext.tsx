import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export interface GuestState {
  isGuest: boolean;
  guestId: string;
  chatMessagesUsed: number;
  chatLimit: number;
  createdAt: number;
}

interface GuestContextType {
  guestState: GuestState | null;
  startGuestSession: () => void;
  endGuestSession: () => void;
  incrementChatMessage: () => boolean; // Returns true if limit reached
  canSendChatMessage: () => boolean;
  isGuest: boolean;
}

const GuestContext = createContext<GuestContextType | undefined>(undefined);

const GUEST_STORAGE_KEY = 'lorekeeper_guest_state';
const DEFAULT_CHAT_LIMIT = 5; // 5 messages for guests

// Generate a unique guest ID
const generateGuestId = (): string => {
  return `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const GuestProvider = ({ children }: { children: ReactNode }) => {
  const [guestState, setGuestState, clearGuestState] = useLocalStorage<GuestState | null>(
    GUEST_STORAGE_KEY,
    null
  );

  // Check if guest session is expired (24 hours)
  useEffect(() => {
    if (guestState && guestState.createdAt) {
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;
      if (now - guestState.createdAt > dayInMs) {
        clearGuestState();
      }
    }
  }, [guestState, clearGuestState]);

  const startGuestSession = () => {
    const newGuestState: GuestState = {
      isGuest: true,
      guestId: generateGuestId(),
      chatMessagesUsed: 0,
      chatLimit: DEFAULT_CHAT_LIMIT,
      createdAt: Date.now(),
    };
    setGuestState(newGuestState);
  };

  const endGuestSession = () => {
    clearGuestState();
  };

  const incrementChatMessage = (): boolean => {
    if (!guestState) return false;
    
    const newCount = guestState.chatMessagesUsed + 1;
    const limitReached = newCount >= guestState.chatLimit;
    
    setGuestState({
      ...guestState,
      chatMessagesUsed: newCount,
    });

    return limitReached;
  };

  const canSendChatMessage = (): boolean => {
    if (!guestState) return true; // Not a guest, no limit
    return guestState.chatMessagesUsed < guestState.chatLimit;
  };

  const isGuest = guestState?.isGuest ?? false;

  return (
    <GuestContext.Provider
      value={{
        guestState,
        startGuestSession,
        endGuestSession,
        incrementChatMessage,
        canSendChatMessage,
        isGuest,
      }}
    >
      {children}
    </GuestContext.Provider>
  );
};

export const useGuest = () => {
  const context = useContext(GuestContext);
  if (context === undefined) {
    throw new Error('useGuest must be used within a GuestProvider');
  }
  return context;
};

