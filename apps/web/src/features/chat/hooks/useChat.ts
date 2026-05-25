import { useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useChatStream } from '../../../hooks/useChatStream';
import { useLoreKeeper } from '../../../hooks/useLoreKeeper';
import { useGuest } from '../../../contexts/GuestContext';
import { useCurrentContext } from '../../../contexts/CurrentContextContext';
import { useSoulProfileChatContextOptional } from '../../../contexts/SoulProfileChatContext';
import { useConversationStore } from './useConversationStore';
import { getGlobalMockDataEnabled } from '../../../contexts/MockDataContext';
import { apiCache } from '../../../lib/cache';
import { fetchJson } from '../../../lib/api';
import type { Message, ChatSource } from '../message/ChatMessage';
import { parseSlashCommand, handleSlashCommand } from '../../../utils/chatCommands';
import { analytics } from '../../../lib/monitoring';

type LoadingStage = 'analyzing' | 'searching' | 'connecting' | 'reasoning' | 'generating';

// Returns true for network errors that indicate the backend is simply not running.
function isBackendUnavailable(error: string): boolean {
  return (
    error.includes('Backend server is not running') ||
    error.includes('Failed to fetch') ||
    error.includes('ERR_CONNECTION_REFUSED') ||
    error.includes('NetworkError') ||
    error.includes('network error')
  );
}

// Friendly demo response shown when the backend is unreachable and the user
// is in guest or mock-data mode. Gives a sense of what the real system would say.
function getDemoResponse(message: string): string {
  const lower = message.toLowerCase();
  const prefix = '*(Demo mode — backend not connected)*\n\n';
  if (/villain|character|person|who is|tell me about/.test(lower)) {
    return prefix + "In the full version I'd recall everything I know about that character from your lore — relationships, backstory, past mentions. Sign up to enable real memory.";
  }
  if (/remember|recall|what do you know|what did i|have i ever/.test(lower)) {
    return prefix + "In the full version I'd search through your stored memories and surface matching entries with dates and context. Sign up to enable real recall.";
  }
  if (/chapter|story|timeline|arc|saga/.test(lower)) {
    return prefix + "In the full version I'd pull your story timeline, chapter summaries, and narrative arcs. Sign up for full lore access.";
  }
  if (/log this|save this|remember this|journal entry|lore note/.test(lower)) {
    return prefix + "Got it — in the full version this would be saved to your memory and available for recall. Sign up to start building your lore.";
  }
  return prefix + "Your message was received. In the full version the AI would respond using your stored lore and memories. Start the backend (`npm run dev:server`) or sign up for the hosted version.";
}

export const useChat = () => {
  const { threadId: activeThreadId } = useParams<{ threadId?: string }>();
  const conversationStore = useConversationStore();
  const { messages, setMessages, addMessage, updateMessage, removeMessage, clearConversation: clearConversationStore } = conversationStore;
  const { streamChat, isStreaming, cancel } = useChatStream();
  const { refreshEntries, refreshTimeline, refreshChapters } = useLoreKeeper();
  const { isGuest, canSendChatMessage, incrementChatMessage, guestState } = useGuest();
  const { currentContext } = useCurrentContext();
  const soulProfileChat = useSoulProfileChatContextOptional();
  const soulProfileContext = soulProfileChat?.soulProfileContext ?? undefined;
  
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('analyzing');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    
    // Enhanced loading stages with progress
    setLoadingStage('analyzing');
    setLoadingProgress(5);
    
    // Simulate progress through stages
    progressIntervalRef.current = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev < 30) {
          setLoadingStage('analyzing');
          return Math.min(prev + 2, 30);
        } else if (prev < 50) {
          setLoadingStage('searching');
          return Math.min(prev + 2, 50);
        } else if (prev < 70) {
          setLoadingStage('connecting');
          return Math.min(prev + 2, 70);
        } else {
          setLoadingStage('reasoning');
          return Math.min(prev + 1, 85);
        }
      });
    }, 200);

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
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          
          if (meta.sources && meta.sources.length > 0) {
            setLoadingStage('searching');
            setLoadingProgress(40);
            setSources(prev => [...prev, ...meta.sources]);
          } else if (meta.connections && meta.connections.length > 0) {
            setLoadingStage('connecting');
            setLoadingProgress(60);
          } else {
            setLoadingStage('reasoning');
            setLoadingProgress(70);
          }
        },
        () => {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
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
            citations: metadata?.citations || [],
            // Cognitive observability
            modeDecision: metadata?.modeDecision,
            ragStats: metadata?.ragStats,
            activePersona: metadata?.activePersona,
            // Memory Recall fields
            response_mode: metadata?.response_mode,
            recall_sources: metadata?.recall_sources,
            recall_meta: metadata?.recall_meta,
            recall: metadata?.recall,
            confidence_label: metadata?.confidence_label,
            disclaimer: metadata?.disclaimer,
            // Narrative Story fields
            narrativeStory: metadata?.story,
            narrativeEntryCount: metadata?.entry_count
          });

          // If there's a disambiguation prompt, attach it to the user message
          if (metadata?.disambiguationPrompt) {
            updateMessage(userMessage.id, {
              disambiguation_prompt: metadata.disambiguationPrompt
            });
          }

          setTimeout(() => {
            setLoading(false);
            setStreamingMessageId(null);
            setLoadingStage('analyzing');
            setLoadingProgress(0);
          }, 300);

          // Accurate mood score from the full message (once per send, not per keystroke)
          fetchJson<{ mood: number }>('/api/moods/score', {
            method: 'POST',
            body: JSON.stringify({ text: messageText.trim() }),
          }).catch(() => {});

          // Ingestion pipeline is async — single refresh after it completes (~2-3s)
          setTimeout(() => {
            apiCache.deletePattern(/\/api\/(entries|timeline|chapters)/);
            Promise.all([refreshEntries(), refreshTimeline(), refreshChapters()]).catch(() => {});
          }, 3000);
        },
        (error) => {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          setLoading(false);
          setStreamingMessageId(null);
          // In guest/mock-data mode, swap backend-unavailable errors for a demo response
          // so there is no console spam and no scary error text.
          const useDemoFallback = (isGuest || getGlobalMockDataEnabled()) && isBackendUnavailable(error);
          updateMessage(assistantMessageId, {
            content: useDemoFallback ? getDemoResponse(messageText) : `Sorry, I encountered an error: ${error}`,
            isStreaming: false
          });
        },
        undefined,
        currentContext,
        soulProfileContext ?? undefined,
        (feedback) => {
          updateMessage(assistantMessageId, { cognitionFeedback: feedback });
        },
        activeThreadId
      );
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoading(false);
      setStreamingMessageId(null);

      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      const useDemoFallback = (isGuest || getGlobalMockDataEnabled()) && isBackendUnavailable(errMsg);

      if (useDemoFallback) {
        // Replace the streaming placeholder with a demo response — no error shown, no console noise.
        updateMessage(assistantMessageId, {
          content: getDemoResponse(messageText),
          isStreaming: false
        });
      } else {
        removeMessage(assistantMessageId);
        addMessage({
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errMsg}`,
          timestamp: new Date()
        });
      }
    }
  }, [messages, loading, isGuest, canSendChatMessage, guestState, addMessage, updateMessage, removeMessage, streamChat, refreshEntries, refreshTimeline, refreshChapters, incrementChatMessage, currentContext, soulProfileContext]);

  const clearConversation = useCallback(() => {
    clearConversationStore();
    setSources([]);
  }, [clearConversationStore]);

  return {
    messages,
    setMessages,
    sendMessage,
    isLoading: loading || isStreaming,
    loadingStage,
    loadingProgress,
    streamingMessageId,
    sources,
    clearConversation,
    messageRefs: conversationStore.messageRefs,
    registerMessageRef: conversationStore.registerMessageRef,
  };
};

