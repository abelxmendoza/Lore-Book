import { useCallback, useRef } from 'react';
import { useChatThreadContext } from '../../../contexts/ChatThreadContext';
import type { Message } from '../message/ChatMessage';

type MessageMutationOptions = {
  /** Bump sidebar ordering — only on new user message or completed stream */
  touchActivity?: boolean;
};

/**
 * Active-thread message adapter over the canonical ChatThreadProvider cache.
 * Does not own storage — reads/writes via updateActiveMessages on the shared cache.
 */
export const useConversationStore = () => {
  const { activeMessages, updateActiveMessages, clearActiveMessages } = useChatThreadContext();
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const clearConversation = useCallback(() => {
    clearActiveMessages();
  }, [clearActiveMessages]);

  const setMessages = useCallback(
    (messages: Message[]) => {
      updateActiveMessages(messages);
    },
    [updateActiveMessages]
  );

  const addMessage = useCallback(
    (message: Message, opts?: MessageMutationOptions) => {
      updateActiveMessages((prev) => [...prev, message], opts);
    },
    [updateActiveMessages]
  );

  const updateMessage = useCallback(
    (messageId: string, updates: Partial<Message>, opts?: MessageMutationOptions) => {
      updateActiveMessages(
        (prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg)),
        opts
      );
    },
    [updateActiveMessages]
  );

  const removeMessage = useCallback(
    (messageId: string) => {
      updateActiveMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    },
    [updateActiveMessages]
  );

  const registerMessageRef = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(messageId, element);
    } else {
      messageRefs.current.delete(messageId);
    }
  }, []);

  return {
    messages: activeMessages,
    setMessages,
    messageRefs,
    clearConversation,
    addMessage,
    updateMessage,
    removeMessage,
    registerMessageRef,
  };
};
