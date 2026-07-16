import { useState, useCallback, useRef } from 'react';
import {
  parseChatStreamEvent,
  type ChatStreamDurability,
  type ChatStreamDoneEvent,
} from '@lorebook/api-contracts';
import { supabase } from '../lib/supabase';
import { config, log } from '../config/env';
import { getGlobalIsGuest } from '../contexts/MockDataContext';
import { getGuestLoreSnapshot } from '../services/guestLoreStore';
import type { CurrentContext, SoulProfileContext } from '../types/currentContext';
import type { ChatFocus } from '../types/chatFocus';
import { dispatchStoryDataUpdated } from '../lib/storyRefresh';
import { pollLoreBookNotice, dispatchLoreBookNotice } from '../lib/loreBookNoticeClient';
import type { ChatImageAttachment } from '../features/chat/types/chatImageAttachment';
import { addCsrfHeaders, acquireCsrfToken, getCsrfToken } from '../lib/security';

export type { ChatStreamDurability };

/** A user-confirmation action chip emitted by the server's Response Compiler. */
export type ResponseActionCandidate = NonNullable<
  NonNullable<ChatStreamDoneEvent['responseCompiler']>['actionCandidates']
>[number];

/** First-session "aha" callback: LoreBook recalled something said earlier. */
export type ContinuityCallback = NonNullable<ChatStreamDoneEvent['continuityCallback']>;

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

    // Server caps history entries at 4000 chars — truncate here so one long past
    // reply doesn't 400 every subsequent send in the thread.
    conversationHistory = conversationHistory.map((m) =>
      m.content.length > 4000 ? { ...m, content: m.content.slice(0, 4000) } : m,
    );

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

      // Align stream requests with fetchJson auth/CSRF/timezone headers.
      if (token && !getCsrfToken()) {
        await acquireCsrfToken(token, apiUrl).catch(() => {});
      }
      const headers = addCsrfHeaders({
        'Content-Type': 'application/json',
        'X-User-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }) as Record<string, string>;

      const response = await fetch(url, {
        method: 'POST',
        headers,
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
        const extractDurability = (body: Record<string, unknown> | null): ChatStreamDurability | undefined => {
          if (!body) return undefined;
          if (body.durability && typeof body.durability === 'object') {
            return body.durability as ChatStreamDurability;
          }
          const notice = body.notice as { code?: string } | undefined;
          const noticeSaved =
            typeof notice?.code === 'string' && notice.code.startsWith('message_saved');
          if (body.userMessage || body.ingestion || body.assistantResponse || noticeSaved) {
            const userMessageRecord =
              typeof body.userMessage === 'object' && body.userMessage
                ? (body.userMessage as ChatStreamDurability['userMessage'])
                : (body.userMessageRecord as ChatStreamDurability['userMessage']);
            return {
              userMessage: userMessageRecord ?? (noticeSaved ? { persisted: true } : undefined),
              assistantResponse: body.assistantResponse as ChatStreamDurability['assistantResponse'],
              ingestion: body.ingestion as ChatStreamDurability['ingestion'],
            };
          }
          return undefined;
        };
        if (response.status === 503) {
          const body = parseBody();
          if (body && (body.error === 'Database schema incomplete' || Array.isArray(body.missingTables))) {
            userMessage = (body.message as string) || 'Database schema incomplete. Run migrations: ./scripts/run-base-migrations.sh';
          } else {
            userMessage = `Service unavailable (503): ${(body?.error as string) || (body?.message as string) || errorText}`;
          }
          durability = extractDurability(body);
        } else if (response.status === 405) {
          const isProdNoApi = config.env.isProduction && !config.api.url;
          userMessage = isProdNoApi
            ? 'Method Not Allowed (405). The deployed app has no backend. Set VITE_API_URL in Vercel to your API URL (e.g. https://your-api.vercel.app), or run the app locally: npm run dev in apps/web and apps/server.'
            : 'Method Not Allowed (405). The chat API expects POST. Ensure the backend is running (cd apps/server && npm run dev) and that nothing is blocking POST to /api/chat/stream.';
        } else {
          // Prefer durability contract on every non-SSE error (403/429/500/502/…).
          // userMessage may be a structured object { persisted, id } — never use as display copy.
          const body = parseBody();
          const notice = body?.notice as { message?: string; code?: string } | undefined;
          userMessage =
            (typeof notice?.message === 'string' && notice.message) ||
            (typeof body?.userMessage === 'string' ? (body.userMessage as string) : undefined) ||
            (typeof body?.message === 'string' ? (body.message as string) : undefined) ||
            (typeof body?.error === 'string' ? (body.error as string) : undefined) ||
            (response.status === 429
              ? `OpenAI quota/rate limit error: ${errorText}`
              : response.status === 503
                ? `Service unavailable (503): ${errorText}`
                : `HTTP error! status: ${response.status}, message: ${errorText}`);
          if (body?.durability) {
            durability = body.durability as ChatStreamDurability;
          } else if (
            (body?.userMessage && typeof body.userMessage === 'object') ||
            body?.ingestion ||
            body?.assistantResponse
          ) {
            durability = {
              userMessage: body.userMessage as ChatStreamDurability['userMessage'],
              assistantResponse: body.assistantResponse as ChatStreamDurability['assistantResponse'],
              ingestion: body.ingestion as ChatStreamDurability['ingestion'],
            };
          }
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

          const data = parseChatStreamEvent(line.slice(6));
          if (!data) {
            // Unknown or malformed frame — skip (dev log only).
            if (config.logging.logApiCalls) {
              log.debug('[useChatStream] Skipped non-contract SSE frame');
            }
            continue;
          }

          if (data.type === 'metadata') {
            const meta = data.data ?? {};
            if (typeof meta.messageId === 'string') capturedMessageId = meta.messageId;
            onMetadata(meta);
          } else if (data.type === 'chunk') {
            if (data.content) onChunk(data.content);
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

