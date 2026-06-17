import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { setGlobalIsGuest } from './MockDataContext';

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
export const GUEST_CHAT_LIMIT = 5;

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
        setGlobalIsGuest(false);
      }
    }
  }, [guestState, clearGuestState]);

  // Daily reset: new calendar day → fresh guest allowance.
  useEffect(() => {
    if (!guestState?.isGuest) return;
    const now = Date.now();
    const today = new Date(now).toDateString();
    const sessionDay = new Date(guestState.createdAt).toDateString();
    if (today !== sessionDay) {
      setGuestState({
        ...guestState,
        chatMessagesUsed: 0,
        chatLimit: guestState.chatLimit || GUEST_CHAT_LIMIT,
        createdAt: now,
      });
    }
  }, [guestState?.isGuest, guestState?.createdAt, guestState?.chatLimit, setGuestState]);

  const startGuestSession = () => {
    const newGuestState: GuestState = {
      isGuest: true,
      guestId: generateGuestId(),
      chatMessagesUsed: 0,
      chatLimit: GUEST_CHAT_LIMIT,
      createdAt: Date.now(),
    };
    setGuestState(newGuestState);
    setGlobalIsGuest(true);
  };

  const endGuestSession = () => {
    clearGuestState();
    setGlobalIsGuest(false);
  };

  // Sync global guest flag when guest state loads from storage (e.g. page refresh)
  useEffect(() => {
    setGlobalIsGuest(guestState?.isGuest ?? false);
  }, [guestState?.isGuest]);

  const incrementChatMessage = (): boolean => {
    let limitReached = false;
    setGuestState((prev) => {
      if (!prev) return prev;
      const newCount = prev.chatMessagesUsed + 1;
      limitReached = newCount >= prev.chatLimit;
      return { ...prev, chatMessagesUsed: newCount };
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

