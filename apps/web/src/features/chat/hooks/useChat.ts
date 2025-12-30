import { useState, useCallback, useRef, useEffect } from 'react';
import { useChatStream } from '../../../hooks/useChatStream';
import { useLoreKeeper } from '../../../hooks/useLoreKeeper';
import { useGuest } from '../../../contexts/GuestContext';
import { useConversationStore } from './useConversationStore';
import type { Message, ChatSource } from '../message/ChatMessage';
import { parseSlashCommand, handleSlashCommand } from '../../../utils/chatCommands';
import { analytics } from '../../../lib/monitoring';

type LoadingStage = 'analyzing' | 'searching' | 'connecting' | 'reasoning' | 'generating';

export const useChat = () => {
  const conversationStore = useConversationStore();
  const { messages, setMessages, addMessage, updateMessage, removeMessage, clearConversation } = conversationStore;
  const { streamChat, isStreaming, cancel } = useChatStream();
  const { refreshEntries, refreshTimeline, refreshChapters } = useLoreKeeper();
  const { isGuest, canSendChatMessage, incrementChatMessage, guestState } = useGuest();
  
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('analyzing');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessageId, scrollToBottom]);

  // Send message
  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || loading) return;

    // Check guest limits
    if (isGuest && !canSendChatMessage()) {
      const limitMessage: Message = {
        id: `limit-${Date.now()}`,
        role: 'assistant',
        content: `You've reached the guest chat limit (${guestState?.chatLimit || 5} messages). Sign up to continue chatting!`,
        timestamp: new Date(),
        isSystemMessage: true,
      };
      addMessage(limitMessage);
      return;
    }

    // Handle slash commands
    const parsed = parseSlashCommand(messageText.trim());
    if (parsed) {
      const result = await handleSlashCommand(parsed.command, parsed.args);
      if (result) {
        if (result.type === 'message') {
          const commandMessage: Message = {
            id: `command-${Date.now()}`,
            role: 'assistant',
            content: result.content || 'Command executed.',
            timestamp: new Date()
          };
          addMessage(commandMessage);
          return;
        }
      }
    }

    // Create user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date()
    };

    addMessage(userMessage);
    setLoading(true);
    setLoadingStage('analyzing');
    setLoadingProgress(0);
    
    // Increment guest message count
    if (isGuest) {
      incrementChatMessage();
    }
    
    analytics.track('chat_message_sent', { 
      messageLength: messageText.trim().length,
      hasSlashCommand: messageText.trim().startsWith('/'),
      isGuest: isGuest,
    });

    // Build conversation history
    const conversationHistory = [...messages, userMessage]
      .slice(-10)
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }));

    // Create placeholder for streaming message
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };

    addMessage(assistantMessage);
    setStreamingMessageId(assistantMessageId);
    setLoadingStage('analyzing');
    setLoadingProgress(10);

    let accumulatedContent = '';
    let metadata: any = null;
    let hasReceivedMetadata = false;

    try {
      await streamChat(
        messageText.trim(),
        conversationHistory.slice(0, -1),
        (chunk) => {
          accumulatedContent += chunk;
          updateMessage(assistantMessageId, { content: accumulatedContent });
          
          if (!hasReceivedMetadata) {
            setLoadingStage('generating');
            setLoadingProgress(70);
            hasReceivedMetadata = true;
          }
          
          const contentProgress = Math.min(25, (accumulatedContent.length / 1000) * 25);
          setLoadingProgress(70 + contentProgress);
        },
        (meta) => {
          metadata = meta;
          
          if (meta.sources && meta.sources.length > 0) {
            setLoadingStage('searching');
            setLoadingProgress(30);
            setSources(prev => [...prev, ...meta.sources]);
          } else if (meta.connections && meta.connections.length > 0) {
            setLoadingStage('connecting');
            setLoadingProgress(50);
          } else {
            setLoadingStage('reasoning');
            setLoadingProgress(60);
          }
        },
        () => {
          setLoadingStage('generating');
          setLoadingProgress(100);
          
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            isStreaming: false,
            ...metadata,
            sources: metadata?.sources,
            connections: metadata?.connections,
            continuityWarnings: metadata?.continuityWarnings,
            timelineUpdates: metadata?.timelineUpdates,
            citations: metadata?.citations || []
          });

          setTimeout(() => {
            setLoading(false);
            setStreamingMessageId(null);
            setLoadingStage('analyzing');
            setLoadingProgress(0);
          }, 300);

          Promise.all([
            refreshEntries(),
            refreshTimeline(),
            refreshChapters()
          ]).catch(console.error);
        },
        (error) => {
          setLoading(false);
          setStreamingMessageId(null);
          updateMessage(assistantMessageId, {
            content: `Sorry, I encountered an error: ${error}`,
            isStreaming: false
          });
        }
      );
    } catch (error) {
      setLoading(false);
      setStreamingMessageId(null);
      removeMessage(assistantMessageId);
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      addMessage(errorMessage);
    }
  }, [messages, loading, isGuest, canSendChatMessage, guestState, addMessage, updateMessage, removeMessage, streamChat, refreshEntries, refreshTimeline, refreshChapters, incrementChatMessage]);

  return {
    messages,
    sendMessage,
    isLoading: loading || isStreaming,
    loadingStage,
    loadingProgress,
    streamingMessageId,
    sources,
    messagesEndRef,
    clearConversation,
    scrollToBottom
  };
};

