import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { config, log } from '../config/env';
import { getGlobalIsGuest } from '../contexts/MockDataContext';
import { getGuestLoreSnapshot } from '../services/guestLoreStore';
import type { CurrentContext, SoulProfileContext } from '../types/currentContext';
import type { ChatFocus } from '../types/chatFocus';
import { dispatchStoryDataUpdated } from '../lib/storyRefresh';
import { pollLoreBookNotice, dispatchLoreBookNotice } from '../lib/loreBookNoticeClient';
import type { ChatImageAttachment } from '../features/chat/types/chatImageAttachment';

/** A user-confirmation action chip emitted by the server's Response Compiler. */
export type ResponseActionCandidate = {
  type: string;
  label: string;
  confidence?: number;
  requiresConfirmation?: boolean;
  payload?: Record<string, unknown>;
};

/** First-session "aha" callback: LoreBook recalled something said earlier. */
export type ContinuityCallback = {
  entity: string;
  quote: string;
  priorMessageIndex: number;
  calloutText: string;
};

type StreamChunk = {
  type: 'metadata' | 'chunk' | 'done' | 'error';
  content?: string;
  data?: any;
  error?: string;
  durability?: ChatStreamDurability;
  responseCompiler?: { actionCandidates?: ResponseActionCandidate[] };
  continuityCallback?: ContinuityCallback;
};

/** Payload handed to onComplete when the stream finishes cleanly. */
export type ChatStreamResult = {
  actionCandidates?: ResponseActionCandidate[];
  continuityCallback?: ContinuityCallback;
};

export type MemoryFeedbackEvent = {
  chatMessageId: string;
  userId: string;
  timestamp: string;
  processingTimeMs: number;
  pipelineComplete: boolean;
  knowledgeUnits: Array<{
    type: 'EXPERIENCE' | 'FEELING' | 'BELIEF' | 'FACT' | 'DECISION' | 'QUESTION';
    content: string;
    confidence: number;
    certaintySource: string;
    temporalScope: 'MOMENT' | 'PERIOD' | 'ONGOING' | 'UNKNOWN';
  }>;
  emotionalSignals: {
    emotions: string[];
    intensity: 'LOW' | 'MEDIUM' | 'HIGH' | null;
    isVenting: boolean;
  };
  entitiesDetected: Array<{ name: string; type: string }>;
  temporalAnchor: { detected: boolean; precision?: string; confidence?: number };
  contradictionsDetected: Array<{ description: string }>;
};

/** Structured durability payload from chat API (assistant failure ≠ memory loss). */
export type ChatStreamDurability = {
  userMessage?: { id?: string; persisted?: boolean; sessionId?: string };
  assistantResponse?: { status?: string; messageId?: string; errorCategory?: string };
  ingestion?: {
    jobId?: string;
    status?: string;
    currentStage?: string;
    retryable?: boolean;
    nextRetryAt?: string;
  };
};

export const useChatStream = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const pollMemoryFeedback = useCallback(async (
    messageId: string,
    token: string | undefined,
    onMemoryFeedback: (feedback: MemoryFeedbackEvent) => void
  ) => {
    const apiUrl = config.api.url;
    const url = apiUrl
      ? `${apiUrl}/api/chat/memory-feedback/${messageId}`
      : `/api/chat/memory-feedback/${messageId}`;

    // The server long-polls 8s per request but the ingestion pipeline can take
    // 8–15s end-to-end. Two attempts (~16s coverage) so slow runs still surface
    // their "remembered" indicator instead of being silently dropped.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.status === 200) {
          const feedback: MemoryFeedbackEvent = await res.json();
          onMemoryFeedback(feedback);
          if (feedback.pipelineComplete) {
            dispatchStoryDataUpdated({ scopes: ['all', 'skills', 'quests'], delayMs: 500 });
          }
          return;
        }
        // 204 = not ready yet — retry once, then give up
      } catch {
        return; // network error — non-critical, silently drop
      }
    }
  }, []);

  const streamChat = useCallback(async (
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    onChunk: (content: string) => void,
    onMetadata: (metadata: any) => void,
    onComplete: (result?: ChatStreamResult) => void,
    onError: (error: string, durability?: ChatStreamDurability) => void,
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string },
    currentContext?: CurrentContext,
    soulProfileContext?: SoulProfileContext | null,
    onMemoryFeedback?: (feedback: MemoryFeedbackEvent) => void,
    threadId?: string,
    threadEntities?: Array<{ id: string; name: string; type: string }>,
    composerEntities?: Array<{ id: string; name: string; type: string; status?: string; aliases?: string[] }>,
    guestOptions?: { guestId: string },
    chatFocus?: ChatFocus,
    previewCorrections?: import('../lib/entityCorrectionTypes').CorrectedPreviewSpan[],
    images?: ChatImageAttachment[],
    /** Stable send-attempt key — reuse on retry of the same send to avoid duplicate user rows. */
    clientIdempotencyKey?: string,
  ) => {
    setIsStreaming(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const useGuestStream = !token && getGlobalIsGuest() && guestOptions?.guestId;

      const apiUrl = config.api.url;
      const url = useGuestStream
        ? (apiUrl ? `${apiUrl}/api/guest/stream` : '/api/guest/stream')
        : (apiUrl ? `${apiUrl}/api/chat/stream` : '/api/chat/stream');

      if (config.logging.logApiCalls) {
        log.debug('[useChatStream] Calling:', url);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'omit',
        mode: 'cors',
        body: JSON.stringify(
          useGuestStream
            ? {
                guestId: guestOptions!.guestId,
                message,
                conversationHistory,
                guestLore: getGuestLoreSnapshot(guestOptions!.guestId),
              }
            : {
                message,
                conversationHistory,
                ...(threadId ? { threadId } : {}),
                ...(clientIdempotencyKey ? { clientIdempotencyKey } : {}),
                ...(threadEntities && threadEntities.length > 0 ? { threadEntities } : {}),
                ...(composerEntities && composerEntities.length > 0
                  ? {
                      composerEntities: composerEntities.map((e) => ({
                        id: e.id,
                        name: e.name,
                        type: e.type,
                        ...(e.status ? { status: e.status } : {}),
                      })),
                    }
                  : {}),
                ...(entityContext ? { entityContext } : {}),
                ...(chatFocus ? { chatFocus } : {}),
                ...(previewCorrections && previewCorrections.length > 0
                  ? { previewCorrections }
                  : {}),
                ...(currentContext && currentContext.kind !== 'none' ? { currentContext } : {}),
                ...(soulProfileContext && (soulProfileContext.lastReferencedInsightId || ((soulProfileContext.lastSurfacedInsights?.length ?? 0) > 0)) ? { soulProfileContext } : {}),
                ...(images && images.length > 0
                  ? {
                      images: images.map((img) => ({
                        dataUrl: img.dataUrl,
                        ...(img.mimeType ? { mimeType: img.mimeType } : {}),
                        ...(img.detail ? { detail: img.detail } : {}),
                      })),
                    }
                  : {}),
              }
        ),
        signal: abortController.signal
      }).catch((fetchError) => {
        console.error('[useChatStream] Fetch error:', {
          error: fetchError,
          message: fetchError.message,
          name: fetchError.name,
          url,
          apiUrl,
          timestamp: new Date().toISOString(),
        });
        
        // Provide more helpful error message
        const errorMessage = fetchError.message.includes('Failed to fetch') || 
                            fetchError.message.includes('NetworkError') ||
                            fetchError.message.includes('ERR_CONNECTION_REFUSED')
          ? `Backend server is not running. Start it with: cd apps/server && npm run dev`
          : `Network error: ${fetchError.message}. Make sure the backend server is running on ${apiUrl}`;
        
        throw new Error(errorMessage);
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[useChatStream] HTTP error:', response.status, errorText);
        let userMessage: string;
        let durability: ChatStreamDurability | undefined;
        const parseBody = (): Record<string, unknown> | null => {
          try {
            return JSON.parse(errorText) as Record<string, unknown>;
          } catch {
            return null;
          }
        };
        if (response.status === 503) {
          const body = parseBody();
          if (body && (body.error === 'Database schema incomplete' || Array.isArray(body.missingTables))) {
            userMessage = (body.message as string) || 'Database schema incomplete. Run migrations: ./scripts/run-base-migrations.sh';
          } else {
            userMessage = `Service unavailable (503): ${(body?.error as string) || (body?.message as string) || errorText}`;
          }
        } else if (response.status === 405) {
          const isProdNoApi = config.env.isProduction && !config.api.url;
          userMessage = isProdNoApi
            ? 'Method Not Allowed (405). The deployed app has no backend. Set VITE_API_URL in Vercel to your API URL (e.g. https://your-api.vercel.app), or run the app locally: npm run dev in apps/web and apps/server.'
            : 'Method Not Allowed (405). The chat API expects POST. Ensure the backend is running (cd apps/server && npm run dev) and that nothing is blocking POST to /api/chat/stream.';
        } else if (response.status === 403) {
          const body = parseBody();
          userMessage = (body?.userMessage as string) || (body?.message as string) || (body?.error as string) || errorText;
          if (body?.durability) durability = body.durability as ChatStreamDurability;
        } else if (response.status === 429 || response.status === 502) {
          const body = parseBody();
          userMessage =
            (body?.userMessage as string) ||
            (body?.message as string) ||
            (body?.error as string) ||
            (response.status === 429
              ? `OpenAI quota/rate limit error: ${errorText}`
              : errorText);
          if (body?.durability) {
            durability = body.durability as ChatStreamDurability;
          } else if (body?.userMessageRecord || body?.ingestion || body?.assistantResponse) {
            durability = {
              userMessage: body.userMessageRecord as ChatStreamDurability['userMessage'],
              assistantResponse: body.assistantResponse as ChatStreamDurability['assistantResponse'],
              ingestion: body.ingestion as ChatStreamDurability['ingestion'],
            };
          }
        } else {
          const body = parseBody();
          userMessage =
            (body?.userMessage as string) ||
            `HTTP error! status: ${response.status}, message: ${errorText}`;
          if (body?.durability) durability = body.durability as ChatStreamDurability;
        }
        const err = new Error(userMessage) as Error & { durability?: ChatStreamDurability };
        err.durability = durability;
        throw err;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let capturedMessageId: string | undefined;

      let streamCompleted = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;
        if (abortController.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          let data: StreamChunk;
          try {
            data = JSON.parse(line.slice(6));
          } catch (parseError) {
            console.error('Failed to parse SSE data:', parseError);
            continue;
          }

          if (data.type === 'metadata') {
            if (data.data?.messageId) capturedMessageId = data.data.messageId;
            onMetadata(data.data);
          } else if (data.type === 'chunk' && data.content) {
            onChunk(data.content);
          } else if (data.type === 'done') {
            streamCompleted = true;
            onComplete({
              actionCandidates: data.responseCompiler?.actionCandidates ?? [],
              continuityCallback: data.continuityCallback,
            });
            setIsStreaming(false);
            if (onMemoryFeedback && capturedMessageId) {
              pollMemoryFeedback(capturedMessageId, token, onMemoryFeedback);
            }
            if (capturedMessageId && token) {
              void pollLoreBookNotice(capturedMessageId, token, dispatchLoreBookNotice);
            }
            return;
          } else if (data.type === 'error') {
            const streamErr = new Error(data.error || 'Stream error') as Error & {
              durability?: ChatStreamDurability;
            };
            if (data.durability) streamErr.durability = data.durability;
            throw streamErr;
          }
        }
      }

      // Connection closed without explicit done — finalize so UI doesn't hang.
      if (!streamCompleted && !abortController.signal.aborted) {
        onComplete();
        if (onMemoryFeedback && capturedMessageId) {
          pollMemoryFeedback(capturedMessageId, token, onMemoryFeedback);
        }
        if (capturedMessageId && token) {
          void pollLoreBookNotice(capturedMessageId, token, dispatchLoreBookNotice);
        }
      }

      setIsStreaming(false);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setIsStreaming(false);
        return;
      }
      setIsStreaming(false);
      const durability =
        error && typeof error === 'object' && 'durability' in error
          ? (error as { durability?: ChatStreamDurability }).durability
          : undefined;
      onError(error instanceof Error ? error.message : 'Unknown error', durability);
    }
  }, [pollMemoryFeedback]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }, []);

  return { streamChat, isStreaming, cancel };
};

