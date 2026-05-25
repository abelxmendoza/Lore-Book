import { useState, useCallback, useRef } from 'react';
import type { Message } from '../message/ChatMessage';

// Pure in-memory message state.
// Persistence is handled exclusively by useChatThreads (DB) and useChatThreads.persistLocal (guest localStorage).
// This hook intentionally does NOT touch localStorage — that was a dead second authority.
export const useConversationStore = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const clearConversation = useCallback(() => {
    setMessages([]);
  }, []);

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg))
    );
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const registerMessageRef = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(messageId, element);
    } else {
      messageRefs.current.delete(messageId);
    }
  }, []);

  return {
    messages,
    setMessages,
    messageRefs,
    clearConversation,
    addMessage,
    updateMessage,
    removeMessage,
    registerMessageRef,
  };
};
