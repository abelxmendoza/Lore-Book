import { useState, useCallback, useRef } from 'react';
import type { Message } from '../message/ChatMessage';

const CONVERSATION_STORAGE_KEY = 'lorekeeper_chat_conversation';

export const useConversationStore = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Load from localStorage on mount
  const loadConversation = useCallback(() => {
    try {
      const stored = localStorage.getItem(CONVERSATION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setMessages(parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })));
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, []);

  // Save to localStorage
  const saveConversation = useCallback((msgs: Message[]) => {
    try {
      localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(msgs));
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }, []);

  // Clear conversation
  const clearConversation = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(CONVERSATION_STORAGE_KEY);
  }, []);

  // Add message
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      const updated = [...prev, message];
      saveConversation(updated);
      return updated;
    });
  }, [saveConversation]);

  // Update message
  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages((prev) => {
      const updated = prev.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      );
      saveConversation(updated);
      return updated;
    });
  }, [saveConversation]);

  // Remove message
  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const updated = prev.filter((msg) => msg.id !== messageId);
      saveConversation(updated);
      return updated;
    });
  }, [saveConversation]);

  // Register message ref
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
    loadConversation,
    clearConversation,
    addMessage,
    updateMessage,
    removeMessage,
    registerMessageRef
  };
};

