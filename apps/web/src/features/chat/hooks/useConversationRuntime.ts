/**
 * useConversationRuntime
 *
 * Orchestration-only layer for the thread lifecycle.
 * Storage lives in ChatThreadProvider (canonical cache).
 *
 * Responsibilities:
 *   - URL-driven thread hydration
 *   - Navigation helpers (new chat, select, delete, fork)
 *   - Semantic title generation
 *   - Return greeting fetch
 *   - Flush-before-switch durability
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../lib/supabase';
import { fetchJson } from '../../../lib/api';
import { store } from '../../../store';
import { chatApi } from '../../../store/api/chatApi';
import { mutationErrorMessage } from '../../../store/rtkMutationUtils';
import { useChatThreadContext } from '../../../contexts/ChatThreadContext';
import { runtimeDiagnostics } from '../services/runtimeDiagnostics';
import type { Message } from '../message/ChatMessage';
import {
  isGenericThreadTitle,
} from '../utils/threadTitleUtils';
import {
  deriveDemoThreadMeta,
  deriveDemoThreadTitle,
  isDemoChatMockup,
  isSimulatedChatRuntime,
} from '../../../services/demoChatSimulation';

const GREETING_MIN_GAP_HOURS = 12;
const GREETING_MIN_MSG_COUNT = 5;
const GREETING_MAX_GAP_HOURS = 168;

export const useConversationRuntime = () => {
  const navigate = useNavigate();
  const { threadId: threadIdParam } = useParams<{ threadId?: string }>();
  const { loading: authLoading } = useAuth();

  const {
    threads,
    threadsLoading,
    threadsReady,
    threadsHasMore,
    threadsTotal,
    threadsLoadingMore,
    loadMoreThreads,
    currentThreadId,
    setCurrentThreadId,
    createThread,
    getThread,
    hydrateThreadMessages,
    switchThread,
    updateThread,
    renameThread,
    deleteThread,
    flushSave,
    activeThreadId,
    setActiveThreadId,
    activeMessages,
    clearActiveMessages,
    lastError,
    dismissThreadError,
  } = useChatThreadContext();

  const [greetingMessage, setGreetingMessage] = useState<string | null>(null);
  const greetingThreadRef = useRef<string | null>(null);
  const [isHydratingMessages, setIsHydratingMessages] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  const intendedThreadRef = useRef<string | null>(threadIdParam ?? null);
  const hydratedByHandlerRef = useRef<string | null>(null);
  const isHydratedRef = useRef(false);
  const titleGeneratedRef = useRef<string | null>(null);
  const hydrationRequestRef = useRef<string | null>(null);
  const selectionRequestSeqRef = useRef(0);

  const removeEmptyThread = useCallback(
    async (id: string) => {
      if (isDemoChatMockup()) {
        runtimeDiagnostics.record('thread_delete', { threadId: id, meta: { reason: 'empty_on_open_demo' } });
        deleteThread(id);
        hydratedByHandlerRef.current = null;
        hydrationRequestRef.current = null;
        const remaining = threads.filter((t) => t.id !== id);
        const next = remaining.find((t) => t.messages.length > 0) ?? remaining[0];
        if (next) {
          intendedThreadRef.current = next.id;
          isHydratedRef.current = next.messages.length > 0;
          setActiveThreadId(next.id);
          switchThread(next.id);
          navigate(`/chat/${next.id}`, { replace: true });
        } else {
          intendedThreadRef.current = null;
          isHydratedRef.current = false;
          setActiveThreadId(null);
          clearActiveMessages();
          navigate('/chat', { replace: true });
        }
        return;
      }

      try {
        const statusRes = await store
          .dispatch(chatApi.endpoints.getThreadStatus.initiate(id))
          .unwrap();
        if (
          statusRes.success &&
          (statusRes.status?.protected || (statusRes.status?.messageCount ?? 0) > 0)
        ) {
          runtimeDiagnostics.record('thread_delete_blocked', {
            threadId: id,
            meta: { reason: 'protected_or_has_messages' },
          });
          return;
        }
      } catch {
        runtimeDiagnostics.record('thread_delete_blocked', {
          threadId: id,
          meta: { reason: 'status_check_failed' },
        });
        return;
      }

      runtimeDiagnostics.record('thread_delete', { threadId: id, meta: { reason: 'empty_on_open' } });
      deleteThread(id);
      hydratedByHandlerRef.current = null;
      hydrationRequestRef.current = null;
      const remaining = threads.filter((t) => t.id !== id);
      const next = remaining.find((t) => t.messages.length > 0) ?? remaining[0];
      if (next) {
        intendedThreadRef.current = next.id;
        isHydratedRef.current = next.messages.length > 0;
        setActiveThreadId(next.id);
        if (next.messages.length > 0) {
          hydratedByHandlerRef.current = next.id;
          switchThread(next.id);
          navigate(`/chat/${next.id}`, { replace: true });
        } else {
          clearActiveMessages();
          navigate(`/chat/${next.id}`, { replace: true });
        }
      } else {
        intendedThreadRef.current = null;
        isHydratedRef.current = false;
        setActiveThreadId(null);
        clearActiveMessages();
        navigate('/chat', { replace: true });
      }
    },
    [threads, deleteThread, setActiveThreadId, switchThread, navigate, clearActiveMessages]
  );

  const applyHydratedThread = useCallback(
    (threadId: string) => {
      intendedThreadRef.current = threadId;
      isHydratedRef.current = true;
      setActiveThreadId(threadId);
      switchThread(threadId);
      const count = getThread(threadId)?.messages.length ?? 0;
      runtimeDiagnostics.recordTimed('hydration_complete', 'hydration', {
        threadId,
        meta: { messageCount: count },
      });
    },
    [setActiveThreadId, switchThread, getThread]
  );

  const beginHydration = useCallback((threadId: string) => {
    hydrationRequestRef.current = threadId;
    setIsHydratingMessages(true);
    setHydrationError(null);
    runtimeDiagnostics.startTimer('hydration');
  }, []);

  const endHydration = useCallback((threadId: string, outcome: 'done' | 'error' | 'empty', error?: string) => {
    if (hydrationRequestRef.current !== threadId) return;
    hydrationRequestRef.current = null;
    setIsHydratingMessages(false);
    if (outcome === 'error') {
      setHydrationError(error || 'Could not load this conversation.');
    } else {
      setHydrationError(null);
    }
  }, []);

  // ── URL-driven hydration (single path) ─────────────────────────────────────
  useEffect(() => {
    if (authLoading || threadsLoading) return;

    if (threadIdParam) {
      if (hydratedByHandlerRef.current) {
        if (hydratedByHandlerRef.current === threadIdParam) {
          runtimeDiagnostics.record('hydration_skip', { threadId: threadIdParam });
          hydratedByHandlerRef.current = null;
          setActiveThreadId(threadIdParam);
          switchThread(threadIdParam);
          intendedThreadRef.current = threadIdParam;
          isHydratedRef.current = (getThread(threadIdParam)?.messages.length ?? 0) > 0;
          return;
        }
        // The URL moved on to a DIFFERENT thread while a handler-driven
        // selection (handleSelectThread) was still hydrating the old one —
        // e.g. the user hit browser Back/Forward before that hydration
        // resolved. The stale marker must not block hydrating what the URL
        // actually points at now, or this effect no-ops forever and the
        // late-resolving selection can snap the view back to the thread the
        // user was trying to leave. Clear it and fall through to hydrate
        // threadIdParam normally.
        hydratedByHandlerRef.current = null;
      }

      const thread = getThread(threadIdParam);
      const isStreamingActive = thread?.messages.some((m) => m.isStreaming) ?? false;

      if (thread && thread.messages.length > 0 && !isStreamingActive) {
        if (isDemoChatMockup()) {
          intendedThreadRef.current = threadIdParam;
          isHydratedRef.current = true;
          setActiveThreadId(threadIdParam);
          switchThread(threadIdParam);
          return;
        }
        // Reconcile with server in background — never skip when assistant turns may be missing.
        if (hydrationRequestRef.current === threadIdParam) return;
        beginHydration(threadIdParam);
        hydrateThreadMessages(threadIdParam)
          .then((hydratedThread) => {
            if (hydrationRequestRef.current !== threadIdParam) return;
            if (hydratedThread) {
              endHydration(threadIdParam, 'done');
              applyHydratedThread(threadIdParam);
            } else {
              endHydration(threadIdParam, 'empty');
            }
          })
          .catch((err) => {
            endHydration(
              threadIdParam,
              'error',
              err instanceof Error ? err.message : String(err),
            );
          });
        intendedThreadRef.current = threadIdParam;
        isHydratedRef.current = true;
        setActiveThreadId(threadIdParam);
        switchThread(threadIdParam);
        return;
      }

      if (thread && thread.messages.length > 0 && isStreamingActive) {
        intendedThreadRef.current = threadIdParam;
        isHydratedRef.current = true;
        setActiveThreadId(threadIdParam);
        switchThread(threadIdParam);
        runtimeDiagnostics.record('hydration_skip', {
          threadId: threadIdParam,
          meta: { reason: 'streaming_active' },
        });
        return;
      }

      if (thread) {
        if (
          isHydratedRef.current &&
          intendedThreadRef.current === threadIdParam &&
          activeThreadId === threadIdParam &&
          thread.messages.length > 0
        ) {
          runtimeDiagnostics.record('hydration_skip', {
            threadId: threadIdParam,
            meta: { reason: 'already_active' },
          });
          return;
        }

        if (thread.messages.length === 0) {
          setActiveThreadId(threadIdParam);
          switchThread(threadIdParam);
          intendedThreadRef.current = threadIdParam;
          if (hydrationRequestRef.current === threadIdParam) return;
          beginHydration(threadIdParam);
          hydrateThreadMessages(threadIdParam)
            .then((hydratedThread) => {
              if (hydrationRequestRef.current !== threadIdParam) return;
              if (!hydratedThread) {
                endHydration(threadIdParam, 'empty');
                runtimeDiagnostics.record('hydration_empty', { threadId: threadIdParam, meta: { reason: 'not_found' } });
                navigate('/chat', { replace: true });
                return;
              }
              endHydration(threadIdParam, 'done');
              applyHydratedThread(threadIdParam);
            })
            .catch((err) => {
              endHydration(
                threadIdParam,
                'error',
                err instanceof Error ? err.message : String(err),
              );
              runtimeDiagnostics.record('hydration_error', {
                threadId: threadIdParam,
                meta: { error: err instanceof Error ? err.message : String(err) },
              });
            });
          return;
        }

        runtimeDiagnostics.startTimer('hydration');
        intendedThreadRef.current = threadIdParam;
        isHydratedRef.current = true;
        setActiveThreadId(threadIdParam);
        switchThread(threadIdParam);
        runtimeDiagnostics.recordTimed('hydration_complete', 'hydration', { threadId: threadIdParam });
      } else if (threadsReady) {
        if (hydrationRequestRef.current === threadIdParam) return;
        beginHydration(threadIdParam);
        hydrateThreadMessages(threadIdParam)
          .then((hydratedThread) => {
            if (hydrationRequestRef.current !== threadIdParam) return;
            if (!hydratedThread) {
              endHydration(threadIdParam, 'empty');
              runtimeDiagnostics.record('hydration_empty', { threadId: threadIdParam, meta: { reason: 'not_found' } });
              navigate('/chat', { replace: true });
              return;
            }
            endHydration(threadIdParam, 'done');
            applyHydratedThread(threadIdParam);
          })
          .catch((err) => {
            endHydration(
              threadIdParam,
              'error',
              err instanceof Error ? err.message : String(err),
            );
            runtimeDiagnostics.record('hydration_error', {
              threadId: threadIdParam,
              meta: { error: err instanceof Error ? err.message : String(err) },
            });
          });
      }
    } else {
      // Bare `/chat` means "no selected thread" (e.g. entity-focus handoff about
      // to create a fresh draft). Never keep the previous sticky mega-thread
      // selected just because intendedThreadRef still points at it.
      hydratedByHandlerRef.current = null;
      intendedThreadRef.current = null;
      isHydratedRef.current = false;
      setActiveThreadId(null);
      setCurrentThreadId(null);
      clearActiveMessages();
    }
  }, [
    authLoading,
    threadsLoading,
    threadsReady,
    threadIdParam,
    getThread,
    hydrateThreadMessages,
    switchThread,
    setCurrentThreadId,
    applyHydratedThread,
    beginHydration,
    endHydration,
    setActiveThreadId,
    activeThreadId,
    navigate,
    clearActiveMessages,
  ]);

  useEffect(() => {
    titleGeneratedRef.current = null;
  }, [threadIdParam]);

  // ── Return greeting ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!threadIdParam || authLoading || threadsLoading) return;
    if (isSimulatedChatRuntime()) return;

    if (greetingThreadRef.current !== threadIdParam) {
      setGreetingMessage(null);
      greetingThreadRef.current = threadIdParam;
    }

    const thread = getThread(threadIdParam);
    if (!thread) return;

    const gapHours = (Date.now() - new Date(thread.updatedAt).getTime()) / 3_600_000;
    if (gapHours < GREETING_MIN_GAP_HOURS) return;
    if (gapHours > GREETING_MAX_GAP_HOURS) return;
    if (thread.messages.length < GREETING_MIN_MSG_COUNT) return;

    fetchJson<{ success: boolean; greeting: string | null }>(
      `/api/conversation/greeting/${threadIdParam}?gapHours=${gapHours.toFixed(2)}`
    )
      .then(({ greeting }) => {
        if (greetingThreadRef.current === threadIdParam && greeting) {
          setGreetingMessage(greeting);
        }
      })
      .catch(() => {});
  }, [threadIdParam, threadsLoading, authLoading, getThread, threads]);

  // ── Semantic title generation ───────────────────────────────────────────────
  useEffect(() => {
    if (!threadIdParam) return;

    const lastMsg = activeMessages[activeMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isStreaming) return;

    const hasExchange =
      activeMessages.some((m) => m.role === 'user') &&
      activeMessages.some((m) => m.role === 'assistant');
    if (!hasExchange) return;

    if (titleGeneratedRef.current === threadIdParam) return;

    const currentThread = getThread(threadIdParam);
    if (currentThread?.title && !isGenericThreadTitle(currentThread.title)) {
      runtimeDiagnostics.record('title_skip', {
        threadId: threadIdParam,
        meta: { reason: 'already_titled' },
      });
      return;
    }

    titleGeneratedRef.current = threadIdParam;
    runtimeDiagnostics.record('title_start', { threadId: threadIdParam });
    runtimeDiagnostics.startTimer(`title_${threadIdParam}`);

    if (isDemoChatMockup()) {
      const meta = deriveDemoThreadMeta(activeMessages);
      const firstUser = activeMessages.find((m) => m.role === 'user' && m.content?.trim());
      const derivedTitle = firstUser ? deriveDemoThreadTitle(firstUser.content) : undefined;
      runtimeDiagnostics.recordTimed('title_complete', `title_${threadIdParam}`, {
        threadId: threadIdParam,
        meta: { title: 'demo_local' },
      });
      updateThread(threadIdParam, {
        ...(derivedTitle && isGenericThreadTitle(currentThread?.title ?? '')
          ? { title: derivedTitle }
          : {}),
        subtitle: meta.subtitle,
        dominantEntities: meta.dominantEntities,
      });
      return;
    }

    const payload = activeMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, 6)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const lastAssistant = [...activeMessages]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.isStreaming);
    const modeDecision = lastAssistant?.modeDecision?.mode;

    void store
      .dispatch(
        chatApi.endpoints.generateThreadTitle.initiate({
          threadId: threadIdParam,
          messages: payload,
          ...(modeDecision ? { modeDecision } : {}),
        })
      )
      .unwrap()
      .then(({ title, subtitle, dominantEntities }) => {
        runtimeDiagnostics.recordTimed('title_complete', `title_${threadIdParam}`, {
          threadId: threadIdParam,
          meta: { title },
        });
        if (title && !isGenericThreadTitle(title)) {
          updateThread(threadIdParam, {
            title,
            subtitle,
            ...(dominantEntities ? { dominantEntities } : {}),
          });
        }
      })
      .catch((err: unknown) => {
        const errMsg = mutationErrorMessage(err);
        runtimeDiagnostics.recordTimed('title_error', `title_${threadIdParam}`, {
          threadId: threadIdParam,
          meta: { error: errMsg },
        });
      });
  }, [threadIdParam, activeMessages, getThread, updateThread]);

  const handleNewChat = useCallback(() => {
    if (currentThreadId) {
      runtimeDiagnostics.record('flush_save', { threadId: currentThreadId });
      flushSave(currentThreadId);
    }
    const id = createThread();
    runtimeDiagnostics.record('thread_create', { threadId: id });
    intendedThreadRef.current = id;
    isHydratedRef.current = true;
    hydratedByHandlerRef.current = id;
    setActiveThreadId(id);
    navigate(`/chat/${id}`);
  }, [currentThreadId, flushSave, createThread, navigate, setActiveThreadId]);

  const handleSelectThread = useCallback(
    async (id: string) => {
      const requestSeq = ++selectionRequestSeqRef.current;
      if (currentThreadId && currentThreadId !== id) {
        runtimeDiagnostics.record('flush_save', { threadId: currentThreadId });
        flushSave(currentThreadId);
      }
      runtimeDiagnostics.startTimer('thread_switch');
      intendedThreadRef.current = id;
      isHydratedRef.current = false;
      hydratedByHandlerRef.current = id;
      setActiveThreadId(id);

      let thread = getThread(id);
      if (!thread || thread.messages.length === 0) {
        const hydratedThread = await hydrateThreadMessages(id);
        // Bail if superseded by either another handleSelectThread call (seq)
        // or by out-of-band navigation the URL effect already picked up
        // (browser Back/Forward, a direct navigate() elsewhere) — otherwise
        // this late resolution can snap the view back to the thread the
        // user just navigated away from.
        if (selectionRequestSeqRef.current !== requestSeq || intendedThreadRef.current !== id) {
          runtimeDiagnostics.record('hydration_skip', {
            threadId: id,
            meta: { reason: 'stale_thread_select' },
          });
          return;
        }
        if (hydratedThread) thread = hydratedThread;
      }

      if (!thread || thread.messages.length === 0) {
        intendedThreadRef.current = id;
        isHydratedRef.current = true;
        hydratedByHandlerRef.current = id;
        setActiveThreadId(id);
        switchThread(id);
        navigate(`/chat/${id}`);
        runtimeDiagnostics.recordTimed('thread_switch', 'thread_switch', {
          threadId: id,
          meta: { result: 'empty_or_unavailable' },
        });
        return;
      }

      intendedThreadRef.current = id;
      isHydratedRef.current = true;
      hydratedByHandlerRef.current = id;
      setActiveThreadId(id);
      switchThread(id);
      navigate(`/chat/${id}`);
      runtimeDiagnostics.recordTimed('thread_switch', 'thread_switch', { threadId: id });
    },
    [
      currentThreadId,
      flushSave,
      getThread,
      hydrateThreadMessages,
      switchThread,
      navigate,
      setActiveThreadId,
    ]
  );

  const handleDeleteThread = useCallback(
    async (id: string) => {
      const remaining = threads.filter((t) => t.id !== id);
      let next = remaining[0];
      runtimeDiagnostics.record('thread_delete', { threadId: id });
      deleteThread(id);
      if (threadIdParam === id) {
        if (next && next.messages.length === 0) {
          const hydrated = await hydrateThreadMessages(next.id);
          if (hydrated) next = hydrated;
        }
        if (next && next.messages.length > 0) {
          intendedThreadRef.current = next.id;
          isHydratedRef.current = true;
          hydratedByHandlerRef.current = next.id;
          setActiveThreadId(next.id);
          navigate(`/chat/${next.id}`);
        } else if (next) {
          intendedThreadRef.current = next.id;
          isHydratedRef.current = false;
          hydratedByHandlerRef.current = next.id;
          setActiveThreadId(next.id);
          navigate(`/chat/${next.id}`);
        } else {
          intendedThreadRef.current = null;
          isHydratedRef.current = false;
          setActiveThreadId(null);
          navigate('/chat');
        }
      }
    },
    [
      threads,
      deleteThread,
      threadIdParam,
      navigate,
      hydrateThreadMessages,
      setActiveThreadId,
    ]
  );

  const forkThread = useCallback(
    async (fromMessageId?: string) => {
      const sourceId = threadIdParam ?? currentThreadId;
      if (!sourceId) return;
      try {
        await flushSave(sourceId);
        const res = await store
          .dispatch(
            chatApi.endpoints.forkThread.initiate({
              sourceThreadId: sourceId,
              messageId: fromMessageId,
            })
          )
          .unwrap();
        if (res.success && res.thread?.id) {
          intendedThreadRef.current = res.thread.id;
          navigate(`/chat/${res.thread.id}`);
        }
      } catch (err) {
        console.error('[useConversationRuntime] forkThread failed', err);
      }
    },
    [threadIdParam, currentThreadId, flushSave, navigate]
  );

  const clearGreeting = useCallback(() => {
    setGreetingMessage(null);
  }, []);

  const retryHydrateActiveThread = useCallback(() => {
    const id = threadIdParam;
    if (!id) return;
    if (hydrationRequestRef.current === id) return;
    beginHydration(id);
    hydrateThreadMessages(id)
      .then((hydratedThread) => {
        if (hydrationRequestRef.current !== id) return;
        if (!hydratedThread) {
          endHydration(id, 'empty');
          runtimeDiagnostics.record('hydration_empty', { threadId: id, meta: { reason: 'not_found_retry' } });
          navigate('/chat', { replace: true });
          return;
        }
        endHydration(id, 'done');
        applyHydratedThread(id);
      })
      .catch((err) => {
        endHydration(id, 'error', err instanceof Error ? err.message : String(err));
        runtimeDiagnostics.record('hydration_error', {
          threadId: id,
          meta: { error: err instanceof Error ? err.message : String(err), retry: true },
        });
      });
  }, [threadIdParam, beginHydration, endHydration, hydrateThreadMessages, applyHydratedThread, navigate]);

  return {
    threads,
    threadsLoading,
    threadsReady,
    threadsHasMore,
    threadsTotal,
    threadsLoadingMore,
    loadMoreThreads,
    activeThreadId: threadIdParam ?? activeThreadId ?? currentThreadId,
    activeThread: threadIdParam ? getThread(threadIdParam) : null,
    activeMessages,
    greetingMessage,
    clearGreeting,
    isHydratingMessages,
    hydrationError,
    retryHydrateActiveThread,
    handleNewChat,
    handleSelectThread,
    handleDeleteThread,
    renameThread,
    updateThread,
    flushSave,
    getThread,
    forkThread,
    lastError,
    dismissThreadError,
  };
};
