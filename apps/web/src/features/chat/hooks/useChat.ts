import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useChatThreadContext } from '../../../contexts/ChatThreadContext';
import { useChatStream } from '../../../hooks/useChatStream';
import { useLoreKeeper } from '../../../hooks/useLoreKeeper';
import { useGuest, GUEST_CHAT_LIMIT } from '../../../contexts/GuestContext';
import { useCurrentContext } from '../../../contexts/CurrentContextContext';
import { useSoulProfileChatContextOptional } from '../../../contexts/SoulProfileChatContext';
import { useConversationStore } from './useConversationStore';
import { invalidateAfterChatIngestion } from '../../../store/invalidateEntityCache';
import { getGlobalMockDataEnabled } from '../../../contexts/MockDataContext';
import {
  isSimulatedChatRuntime,
  simulateDemoChatSend,
  buildDemoChatResponse,
} from '../../../services/demoChatSimulation';
import { shouldSimulateChat, shouldUseMockData } from '../../../hooks/useShouldUseMockData';
import { useAuth } from '../../../lib/supabase';
import { apiCache } from '../../../lib/cache';
import { fetchJson } from '../../../lib/api';
import { friendlyPostgresErrorMessage } from '../../../lib/postgresError';
import { dispatchStoryDataUpdated } from '../../../lib/storyRefresh';
import type { Message, ChatSource } from '../message/ChatMessage';
import { threadPersistenceTracker } from '../services/threadPersistenceTracker';
import { parseSlashCommand, handleSlashCommand } from '../../../utils/chatCommands';
import { analytics } from '../../../lib/monitoring';
import { useAppDispatch } from '../../../store/hooks';
import { recordChatFocusMessage } from '../../../store/slices/selectionSlice';
import type { ChatFocus } from '../../../types/chatFocus';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import type { ChatImageAttachment } from '../types/chatImageAttachment';
import { IMAGE_ATTACHED_PLACEHOLDER } from '../types/chatImageAttachment';
import type { ThreadEntity } from '../utils/collectThreadEntities';

type LoadingStage = 'analyzing' | 'searching' | 'connecting' | 'reasoning' | 'generating';

import { applyGuestLoreUpdates } from '../../../services/guestLoreStore';
import {
  mergeThreadEntities,
  toComposerThreadEntity,
  type CertifiedEntityMatch,
} from '../../../lib/certifiedEntityMatch';

export type ChatSendOptions = {
  entityContext?: {
    type: 'CHARACTER' | 'LOCATION' | 'ENTITY' | 'ROMANTIC_RELATIONSHIP' | 'PERCEPTION' | 'MEMORY' | 'GOSSIP';
    id: string;
  };
  threadEntities?: ThreadEntity[];
  composerEntities?: CertifiedEntityMatch[];
  previewCorrections?: CorrectedPreviewSpan[];
  chatFocus?: ChatFocus;
  /** Vision attachments for this turn only (not re-sent as history). */
  images?: ChatImageAttachment[];
};

// Guest sessions have no auth token — treat auth failures like an unavailable backend.
function isGuestStreamBlocked(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('not authenticated') ||
    lower.includes('sign in')
  );
}

// Returns true for network errors that indicate the backend is simply not running.
function isBackendUnavailable(error: string): boolean {
  return (
    error.includes('Backend server is not running') ||
    error.includes('Backend unavailable') ||
    error.includes('Service unavailable (503)') ||
    error.includes('Failed to fetch') ||
    error.includes('ERR_CONNECTION_REFUSED') ||
    error.includes('NetworkError') ||
    error.includes('network error')
  );
}

function isOpenAIBudgetExceeded(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('openai_budget_exceeded') ||
    lower.includes('ai budget') ||
    lower.includes('monthly budget')
  );
}

// Returns true when the error is an OpenAI quota/rate-limit issue.
function isOpenAIRateLimited(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    error.includes('429') ||
    lower.includes('quota exceeded') ||
    lower.includes('quota is exhausted') ||
    lower.includes('quota exhausted') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('insufficient_quota') ||
    lower.includes('rate limit') ||
    lower.includes('openai 429')
  );
}

// Returns true when OpenAI is reachable but the call failed for a non-quota reason.
function isOpenAIError(error: string): boolean {
  return (
    error.toLowerCase().includes('openai') ||
    error.includes('model') ||
    error.includes('completion')
  ) && !isOpenAIRateLimited(error);
}

// Map a raw error string to a user-facing message.
function friendlyErrorMessage(errMsg: string): string {
  const storageMessage = friendlyPostgresErrorMessage(errMsg);
  if (storageMessage) return storageMessage;
  if (isBackendUnavailable(errMsg)) {
    return 'Server is temporarily unavailable. Try again in a moment.';
  }
  if (isOpenAIBudgetExceeded(errMsg)) {
    return errMsg.includes('LoreBook hit') ? errMsg : (
      'LoreBook hit its monthly AI budget. Chat replies are paused until the budget resets or OpenAI credits are restored. Your messages are still saved.'
    );
  }
  if (isOpenAIRateLimited(errMsg)) {
    if (
      errMsg.includes('Response generation failed') ||
      errMsg.includes('Response generation stopped') ||
      errMsg.includes('quota is exhausted') ||
      errMsg.includes('exceeded your current quota')
    ) {
      return errMsg;
    }
    return "Response generation failed because the OpenAI quota/rate limit was hit. Memory ingestion and entity creation may not have completed for this send.";
  }
  if (isOpenAIError(errMsg)) {
    return "The AI service encountered an issue. Please try again shortly.";
  }
  return `Sorry, I encountered an error. Please try again.`;
}

// Shown only when the guest preview backend is unreachable.
function getDemoResponse(message: string): string {
  const lower = message.toLowerCase();
  const prefix = '*(Guest preview — server unavailable)*\n\n';
  if (/villain|character|person|who is|tell me about/.test(lower)) {
    return prefix + "I'd extract and track that character from your message — start the backend or sign up for the full experience with persistent memory.";
  }
  if (/remember|recall|what do you know|what did i|have i ever/.test(lower)) {
    return prefix + "I'd search your stored memories and surface matching entries. Connect to the server or create an account to enable real recall.";
  }
  if (/log this|save this|remember this|journal entry|lore note/.test(lower)) {
    return prefix + "Got it — this would be saved to your temporary guest lore and available in Characters and Timeline. Start the backend to try it live.";
  }
  return prefix + "Your message was received. Start the backend (`npm run dev:server`) to try guest chat with real extraction, or sign up for the hosted version.";
}

export const useChat = () => {
  const navigate = useNavigate();
  const { threadId: urlThreadId } = useParams<{ threadId?: string }>();
  const { createThread, setActiveThreadId, getThread, updateThread, mutateThreadMessagesForThread, hydrateThreadMessages } = useChatThreadContext();
  const conversationStore = useConversationStore();
  const { messages, setMessages, addMessage, updateMessage, removeMessage, clearConversation: clearConversationStore } = conversationStore;
  const { streamChat, isStreaming } = useChatStream();
  const { refreshEntries, refreshTimeline, refreshChapters } = useLoreKeeper();
  const { isGuest, canSendChatMessage, incrementChatMessage, guestState } = useGuest();
  const { currentContext } = useCurrentContext();
  const soulProfileChat = useSoulProfileChatContextOptional();
  const soulProfileContext = soulProfileChat?.soulProfileContext ?? undefined;
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('analyzing');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    streamingMessageIdRef.current = streamingMessageId;
  }, [streamingMessageId]);

  // Finalize in-flight assistant bubbles when the tab backgrounds or closes.
  useEffect(() => {
    const finalizePartialStream = () => {
      const streamId = streamingMessageIdRef.current;
      if (!streamId) return;
      updateMessage(streamId, { isStreaming: false });
      setStreamingMessageId(null);
      setLoading(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };

    const onHide = () => finalizePartialStream();
    window.addEventListener('pagehide', onHide);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [updateMessage]);

  // Send message
  const sendMessage = useCallback(async (messageText: string, options?: ChatSendOptions) => {
    const hasImages = (options?.images?.length ?? 0) > 0;
    const resolvedText = messageText.trim() || (hasImages ? IMAGE_ATTACHED_PLACEHOLDER : '');
    if ((!resolvedText && !hasImages) || loading) return;

    if (isGuest && !canSendChatMessage()) {
      addMessage({
        id: `limit-${Date.now()}`,
        role: 'assistant',
        content: `You've reached the guest chat limit (${guestState?.chatLimit ?? GUEST_CHAT_LIMIT} messages). Sign up to continue chatting and unlock unlimited access to all features!`,
        timestamp: new Date(),
        isSystemMessage: true,
      });
      analytics.track('guest_chat_limit_reached', {
        messagesUsed: guestState?.chatMessagesUsed ?? GUEST_CHAT_LIMIT,
      });
      return;
    }

    // Block unauthenticated users (non-guest) before hitting the backend
    if (!user && !isGuest) {
      const isDemo = getGlobalMockDataEnabled();
      addMessage({
        id: `authwall-${Date.now()}`,
        role: 'assistant',
        content: isDemo
          ? "You're in demo mode. Sign in to start chatting with your real Lore Book and save your memories."
          : "You need to sign in to chat. Create a free account to start building your lore and have your memories saved.",
        timestamp: new Date(),
        isSystemMessage: true,
      });
      return;
    }

    // Handle slash commands (text-only; ignore if images attached)
    if (!hasImages) {
      const parsed = parseSlashCommand(resolvedText);
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
    }

    // Ensure a thread exists before writing to the canonical cache
    let threadId = urlThreadId ?? null;
    if (!threadId) {
      threadId = createThread();
      setActiveThreadId(threadId);
    }

    // Create user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: resolvedText,
      timestamp: new Date(),
      persistStatus: 'pending',
      ...(hasImages
        ? {
            attachments: options!.images!.map((img) => ({
              kind: 'image' as const,
              dataUrl: img.dataUrl,
              mimeType: img.mimeType,
            })),
            metadata: {
              attachments: options!.images!.map((img) => ({
                kind: 'image' as const,
                mimeType: img.mimeType,
                detail: img.detail,
              })),
            },
          }
        : {}),
    };

    // Pin all writes for this send to the thread that initiated it — never the
    // (possibly lagging) active-thread adapter, which could append to whatever
    // thread is active by the time React commits and merge conversations.
    const streamThreadId = threadId;
    mutateThreadMessagesForThread(streamThreadId, (prev) => [...prev, userMessage], { touchActivity: true });
    const updateStreamMessage = (messageId: string, updates: Partial<Message>, opts?: { touchActivity?: boolean }) => {
      mutateThreadMessagesForThread(
        streamThreadId,
        (prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg)),
        opts
      );
    };

    if (!urlThreadId) {
      navigate(`/chat/${threadId}`, { replace: true });
    }

    setLoading(true);
    setLoadingStage('analyzing');
    setLoadingProgress(0);
    
    if (isGuest) {
      const limitReached = incrementChatMessage();
      if (limitReached) {
        analytics.track('guest_chat_limit_reached', {
          messagesUsed: (guestState?.chatMessagesUsed ?? 0) + 1,
        });
      }
    }
    
    analytics.track('chat_message_sent', { 
      messageLength: resolvedText.length,
      hasSlashCommand: resolvedText.startsWith('/'),
      isGuest: isGuest,
      chatFocusSurface: options?.chatFocus?.sourceSurface,
      hasImage: hasImages,
    });

    if (options?.chatFocus) {
      dispatch(recordChatFocusMessage({ message: resolvedText }));
    }

    // Build conversation history from canonical thread cache (not stale React closure)
    const priorMessages = getThread(threadId)?.messages ?? messages;
    const conversationHistory = [...priorMessages.filter((m) => m.id !== userMessage.id), userMessage]
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
      isStreaming: true,
      persistStatus: 'pending',
      metadata: {
        intent: 'conversation',
        why: 'Checking relevant context before drafting the response.',
      },
    };

    mutateThreadMessagesForThread(streamThreadId, (prev) => [...prev, assistantMessage]);
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
    let persistedUserMessageId: string | undefined;
    let persistedAssistantMessageId: string | undefined;

    const composerThread = (options?.composerEntities ?? [])
      .map(toComposerThreadEntity)
      .filter((e): e is { id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' } => e !== null);
    const baseThread = (options?.threadEntities ?? [])
      .filter((e): e is { id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' } =>
        e.type === 'character' || e.type === 'location' || e.type === 'organization' || e.type === 'skill',
      )
      .map((e) => ({ id: e.id, name: e.name, type: e.type }));
    const mergedThreadEntities = mergeThreadEntities(baseThread, composerThread);

    type PersistPayload = {
      user?: { saved: boolean; id?: string; error?: string };
      assistant?: { saved: boolean; id?: string; error?: string };
    };

    // Persisted DB ids are recorded here but only applied to the live messages
    // at completion (see the final updateStreamMessage call). Swapping a
    // message's id mid-stream would orphan the `userMessage.id` /
    // `assistantMessageId` handles these handlers keep using, so later content
    // chunks and the completion update would silently no-op and leave a stuck
    // partial bubble.
    const applyPersistence = (persistence?: PersistPayload) => {
      if (!persistence) return;
      if (persistence.user) {
        if (persistence.user.saved && persistence.user.id) {
          persistedUserMessageId = persistence.user.id;
          updateStreamMessage(userMessage.id, { persistStatus: 'saved' });
        } else if (persistence.user.error) {
          updateStreamMessage(userMessage.id, { persistStatus: 'failed' });
          threadPersistenceTracker.markSyncFailed(streamThreadId, persistence.user.error);
        }
      }
      if (persistence.assistant) {
        if (persistence.assistant.saved) {
          const id = persistence.assistant.id ?? persistedAssistantMessageId ?? assistantMessageId;
          persistedAssistantMessageId = id;
          updateStreamMessage(assistantMessageId, { persistStatus: 'saved' });
          threadPersistenceTracker.markPersisted(streamThreadId);
        } else if (
          persistence.assistant.error &&
          persistence.assistant.error !== 'empty_content'
        ) {
          updateStreamMessage(assistantMessageId, { persistStatus: 'failed' });
          threadPersistenceTracker.markSyncFailed(streamThreadId, persistence.assistant.error);
        }
      }
    };

    try {
      if (isSimulatedChatRuntime()) {
        const chatMode = shouldUseMockData() ? 'demo' as const : 'guest' as const;
        const demoResult = await simulateDemoChatSend({
          message: messageText.trim(),
          chatFocus: options?.chatFocus,
          conversationHistory,
          mode: chatMode,
          guestId: guestState?.guestId,
          onStage: (stage, progress) => {
            setLoadingStage(stage);
            setLoadingProgress(progress);
          },
          onChunk: (chunk) => {
            accumulatedContent += chunk;
            updateStreamMessage(assistantMessageId, { content: accumulatedContent });
          },
        });

        if (isGuest && guestState?.guestId && demoResult.loreUpdates) {
          applyGuestLoreUpdates(guestState.guestId, demoResult.loreUpdates);
          Promise.all([refreshEntries(), refreshTimeline(), refreshChapters()]).catch(() => {});
          const characterIds = demoResult.loreUpdates.mentionedEntities
            ?.filter((e) => e.type === 'character')
            .map((e) => e.id);
          invalidateAfterChatIngestion({ characterIds });
          dispatchStoryDataUpdated({ scopes: ['all'], characterIds });
        }

        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setLoadingStage('generating');
        setLoadingProgress(100);

        updateStreamMessage(
          assistantMessageId,
          {
            content: accumulatedContent,
            isStreaming: false,
            persistStatus: 'saved',
            mentionedEntities: demoResult.mentionedEntities,
            connections: demoResult.connections,
            timelineUpdates: demoResult.timelineUpdates,
            modeDecision: demoResult.modeDecision,
          },
          { touchActivity: true }
        );
        updateStreamMessage(userMessage.id, { persistStatus: 'saved' });

        if (demoResult.subtitle || demoResult.dominantEntities) {
          updateThread(streamThreadId, {
            subtitle: demoResult.subtitle,
            dominantEntities: demoResult.dominantEntities,
            touchActivity: true,
          });
        }

        setTimeout(() => {
          setLoading(false);
          setStreamingMessageId(null);
          setLoadingStage('analyzing');
          setLoadingProgress(0);
        }, 300);
        return;
      }

      await streamChat(
        resolvedText,
        conversationHistory.slice(0, -1),
        (chunk) => {
          accumulatedContent += chunk;
          updateStreamMessage(assistantMessageId, { content: accumulatedContent });
          
          if (!hasReceivedMetadata) {
            setLoadingStage('generating');
            setLoadingProgress(70);
            hasReceivedMetadata = true;
          }
          
          const contentProgress = Math.min(25, (accumulatedContent.length / 1000) * 25);
          setLoadingProgress(70 + contentProgress);
        },
        (meta) => {
          metadata = { ...(metadata ?? {}), ...meta };
          if (meta.persistence) applyPersistence(meta.persistence);
          // Record persisted ids only — they are applied to the live messages at
          // completion. Swapping ids mid-stream orphans the update handles below.
          if (meta.messageId) {
            persistedUserMessageId = meta.messageId;
          }
          if (meta.assistantMessageId) {
            persistedAssistantMessageId = meta.assistantMessageId;
          }
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          
          if (meta.loreUpdates && isGuest && guestState?.guestId) {
            applyGuestLoreUpdates(guestState.guestId, meta.loreUpdates);
            Promise.all([refreshEntries(), refreshTimeline(), refreshChapters()]).catch(() => {});
            const ids: string[] | undefined = meta.characterIds;
            invalidateAfterChatIngestion({ characterIds: ids });
            dispatchStoryDataUpdated({ scopes: ['all'], characterIds: ids });
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
        (result) => {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          setLoadingStage('generating');
          setLoadingProgress(100);

          updateStreamMessage(
            assistantMessageId,
            {
            actionCandidates: result?.actionCandidates,
            continuityCallback: result?.continuityCallback,
              id: persistedAssistantMessageId ?? assistantMessageId,
              content: accumulatedContent,
              isStreaming: false,
              persistStatus: persistedAssistantMessageId ? 'saved' : metadata?.persistence?.assistant?.saved === false ? 'failed' : 'pending',
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
            continuityAcknowledged: metadata?.continuityAcknowledged,
            // Memory Recall fields
            response_mode: metadata?.response_mode,
            recall_sources: metadata?.recall_sources,
            recall_meta: metadata?.recall_meta,
            recall: metadata?.recall,
            confidence_label: metadata?.confidence_label,
            disclaimer: metadata?.disclaimer,
            // Narrative Story fields
            narrativeStory: metadata?.story,
            narrativeEntryCount: metadata?.entry_count,
            // Entity chips
            mentionedEntities: metadata?.mentionedEntities,
            creationOutcomes: metadata?.creationOutcomes,
            creationOutcomeSummary: metadata?.creationOutcomeSummary,
            staleProjectionHints: metadata?.staleProjectionHints,
            staleProjectionSummary: metadata?.staleProjectionSummary,
            suggestedActions: metadata?.suggestedActions,
          },
          { touchActivity: true }
          );

          if (isGuest) {
            updateStreamMessage(userMessage.id, { persistStatus: 'saved' });
          } else if (persistedUserMessageId) {
            updateStreamMessage(userMessage.id, { id: persistedUserMessageId, persistStatus: 'saved' });
          } else if (!metadata?.persistence?.user?.saved) {
            updateStreamMessage(userMessage.id, { persistStatus: 'failed' });
            threadPersistenceTracker.markSyncFailed(streamThreadId, 'user_message_not_persisted');
          }

          if (!isGuest) {
            setTimeout(() => {
              void hydrateThreadMessages(streamThreadId).catch(() => {});
            }, 1200);
          }

          // If there's a disambiguation prompt, attach it to the user message
          if (metadata?.disambiguationPrompt) {
            updateStreamMessage(userMessage.id, {
              disambiguation_prompt: metadata.disambiguationPrompt
            });
          }

          setTimeout(() => {
            setLoading(false);
            setStreamingMessageId(null);
            setLoadingStage('analyzing');
            setLoadingProgress(0);
          }, 300);

          if (!isGuest) {
            fetchJson<{ mood: number }>('/api/moods/score', {
              method: 'POST',
              body: JSON.stringify({ text: resolvedText }),
            }).catch(() => {});
          }

          const doRefresh = () => {
            apiCache.deletePattern(/\/api\/(entries|timeline|chapters|characters|entity-resolution|family-trees|organizations)/);
            Promise.all([refreshEntries(), refreshTimeline(), refreshChapters()]).catch(() => {});
            const ids: string[] | undefined = metadata?.characterIds;
            const locationIds = (metadata?.mentionedEntities as Array<{ id: string; type: string }> | undefined)
              ?.filter((e) => e.type === 'location')
              .map((e) => e.id) ?? [];
            invalidateAfterChatIngestion({ characterIds: ids, locationIds });
            dispatchStoryDataUpdated({
              scopes: ['all', 'skills', 'quests'],
              characterIds: ids,
            });
          };
          if (isGuest) {
            doRefresh();
          } else {
            setTimeout(doRefresh, 4000);
            setTimeout(doRefresh, 11000);
          }
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
          const useDemoFallback =
            isSimulatedChatRuntime() ||
            (isGuest && (isBackendUnavailable(error) || isGuestStreamBlocked(error))) ||
            (getGlobalMockDataEnabled() && isBackendUnavailable(error));
          updateStreamMessage(assistantMessageId, {
            content: useDemoFallback
              ? buildDemoChatResponse(
                  resolvedText,
                  options?.chatFocus,
                  undefined,
                  shouldUseMockData() ? 'demo' : 'guest',
                  guestState?.guestId,
                ).content
              : friendlyErrorMessage(String(error)),
            isStreaming: false,
            persistStatus: 'failed',
          });
          updateStreamMessage(userMessage.id, { persistStatus: 'failed' });
          threadPersistenceTracker.markSyncFailed(streamThreadId, String(error));
        },
        options?.entityContext,
        currentContext,
        soulProfileContext ?? undefined,
        (feedback) => {
          updateStreamMessage(assistantMessageId, { cognitionFeedback: feedback });
        },
        threadId,
        mergedThreadEntities.length > 0 ? mergedThreadEntities : undefined,
        options?.composerEntities,
        isGuest && guestState?.guestId ? { guestId: guestState.guestId } : undefined,
        options?.chatFocus,
        options?.previewCorrections,
        options?.images,
      );
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoading(false);
      setStreamingMessageId(null);

      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      const useDemoFallback =
        isSimulatedChatRuntime() ||
        (isGuest && (isBackendUnavailable(errMsg) || isGuestStreamBlocked(errMsg))) ||
        (getGlobalMockDataEnabled() && isBackendUnavailable(errMsg));

      if (useDemoFallback) {
        updateStreamMessage(assistantMessageId, {
          content: buildDemoChatResponse(
            resolvedText,
            options?.chatFocus,
            undefined,
            shouldUseMockData() ? 'demo' : 'guest',
            guestState?.guestId,
          ).content,
          isStreaming: false,
        });
      } else {
        updateStreamMessage(assistantMessageId, {
          content: accumulatedContent.trim()
            ? accumulatedContent
            : friendlyErrorMessage(errMsg),
          isStreaming: false,
        });
      }
    }
  }, [messages, loading, isGuest, canSendChatMessage, guestState, addMessage, updateMessage, removeMessage, streamChat, refreshEntries, refreshTimeline, refreshChapters, incrementChatMessage, currentContext, soulProfileContext, user, urlThreadId, createThread, setActiveThreadId, getThread, updateThread, navigate, mutateThreadMessagesForThread, hydrateThreadMessages, dispatch]);

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
