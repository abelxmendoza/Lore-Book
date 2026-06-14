/**
 * useConversationRuntime
 *
 * Canonical orchestration layer for the thread lifecycle.
 * Replaces ~200 lines of useEffect + handler logic previously scattered across ChatFirstInterface.
 *
 * Responsibilities:
 *   - URL-driven thread hydration (threadId param → load messages)
 *   - Auto-create thread when the first message is sent on /chat
 *   - Sync in-memory messages back to the thread store
 *   - Semantic title generation (once per thread, after first AI response)
 *   - Navigation helpers (new chat, select, delete, rename)
 *   - Flush-before-switch durability
 *
 * Architecture note:
 *   This hook does NOT own message state — that lives in useChat / useConversationStore.
 *   Messages and setMessages are injected as options so this hook stays decoupled.
 *   Thread state (useChatThreads) is owned here.
 *
 * Sync contamination prevention:
 *   intendedThreadRef tracks the thread we are syncing TO, set before any setMessages/navigate
 *   call. This prevents the intermediate render state (messages=newThread, threadIdParam=oldThread)
 *   from corrupting the old thread's data in the debounced save.
 *
 *   hydratedByHandlerRef: when a navigation handler loads messages directly, it marks the target
 *   thread id here so the URL-hydration effect can skip the redundant setMessages call.
 *
 *   isHydratedRef: false until first hydration completes; prevents the sync effect from firing
 *   before any messages have been loaded (which would write an empty array to the thread).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../lib/supabase';
import { fetchJson } from '../../../lib/api';
import { useChatThreads } from './useChatThreads';
import { runtimeDiagnostics } from '../services/runtimeDiagnostics';
import type { Message } from '../message/ChatMessage';
import type { TitleGenerationResult } from '../types/conversationMetadata';
import {
  deriveTitleFromFirstUserMessage,
  isGenericThreadTitle,
} from '../utils/threadTitleUtils';

// ── Return greeting constants (MVP: LIGHT + MEDIUM only) ─────────────────────
const GREETING_MIN_GAP_HOURS     = 12;
const GREETING_MIN_MSG_COUNT     = 5;
const GREETING_MAX_GAP_HOURS     = 168; // 7 days

interface ConversationRuntimeOptions {
  /** Live message array from useChat/useConversationStore */
  messages: Message[];
  /** Setter from useChat/useConversationStore */
  setMessages: (msgs: Message[]) => void;
  /** Clear the in-memory message list (used on new chat) */
  clearMessages: () => void;
}

export const useConversationRuntime = ({
  messages,
  setMessages,
  clearMessages,
}: ConversationRuntimeOptions) => {
  const navigate = useNavigate();
  const { threadId: threadIdParam } = useParams<{ threadId?: string }>();
  const { loading: authLoading } = useAuth();

  const {
    threads,
    threadsLoading,
    threadsReady,
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
  } = useChatThreads();

  // ── Return greeting state ────────────────────────────────────────────────────
  const [greetingMessage, setGreetingMessage] = useState<string | null>(null);
  // Tracks which thread the current greeting was generated for — prevents
  // a stale greeting from a previous thread appearing on the new one.
  const greetingThreadRef = useRef<string | null>(null);

  // ── Hydration guards ─────────────────────────────────────────────────────────
  const pendingNewThreadRef = useRef(false);

  // The thread id we are currently syncing messages TO. Set before setMessages/navigate
  // so intermediate renders never sync to the wrong thread.
  const intendedThreadRef = useRef<string | null>(threadIdParam ?? null);

  // When a handler directly loads a thread's messages, it records the id here.
  // The URL-hydration effect checks this and skips its own setMessages call to
  // prevent a redundant double-load.
  const hydratedByHandlerRef = useRef<string | null>(null);

  // Prevents the sync effect from firing before any hydration has occurred.
  const isHydratedRef = useRef(false);

  // Tracks which thread has already had a title generated this session.
  const titleGeneratedRef = useRef<string | null>(null);
  const hydrationRequestRef = useRef<string | null>(null);

  /** Remove a thread with no saved conversation and navigate to a safe fallback. */
  const removeEmptyThread = useCallback(
    async (id: string) => {
      try {
        const statusRes = await fetchJson<{
          success: boolean;
          status?: { protected?: boolean; messageCount?: number };
        }>(`/api/conversation/threads/${id}/status`);
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
        // If we cannot verify, do not delete — avoids losing threads with chat_messages only in DB
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
        if (next.messages.length > 0) {
          hydratedByHandlerRef.current = next.id;
          setMessages(next.messages);
          switchThread(next.id);
          navigate(`/chat/${next.id}`, { replace: true });
        } else {
          clearMessages();
          navigate(`/chat/${next.id}`, { replace: true });
        }
      } else {
        intendedThreadRef.current = null;
        isHydratedRef.current = false;
        clearMessages();
        navigate('/chat', { replace: true });
      }
    },
    [threads, deleteThread, setMessages, switchThread, navigate, clearMessages]
  );

  const applyHydratedThread = useCallback(
    (threadId: string, hydratedThread: { messages: Message[] }) => {
      intendedThreadRef.current = threadId;
      isHydratedRef.current = true;
      setMessages(hydratedThread.messages);
      switchThread(threadId);
      runtimeDiagnostics.recordTimed('hydration_complete', 'hydration', {
        threadId,
        meta: { messageCount: hydratedThread.messages.length },
      });
    },
    [setMessages, switchThread]
  );

  // ── URL-driven hydration ────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || threadsLoading) return;
    if (threadIdParam) {
      // A handler called navigate() but React Router hasn't resolved the new param yet.
      // hydratedByHandlerRef is set to the target thread id. During this race window the
      // old threadIdParam is still active, so the effect would overwrite the handler's
      // setMessages with stale data — causing the "double-click to display" bug.
      // Return early on ANY pending handler, whether or not the URL has caught up yet.
      if (hydratedByHandlerRef.current) {
        if (hydratedByHandlerRef.current === threadIdParam) {
          // URL caught up — clear the guard and skip this hydration cycle.
          runtimeDiagnostics.record('hydration_skip', { threadId: threadIdParam });
          hydratedByHandlerRef.current = null;
        }
        // Still in the race window (URL param hasn't updated yet) — do nothing.
        return;
      }
      const thread = getThread(threadIdParam);
      if (thread) {
        // Guard: already hydrated on this thread. getThread changes identity whenever
        // threads state updates (each streaming chunk → updateThread → threads change →
        // getThread new ref → this effect re-runs). Without this guard the hydration
        // effect fires ~20× per message, writing stale stored messages back into live
        // state and causing a cascade of debounced saves.
        if (isHydratedRef.current && intendedThreadRef.current === threadIdParam && thread.messages.length > 0) {
          runtimeDiagnostics.record('hydration_skip', { threadId: threadIdParam, meta: { reason: 'already_active' } });
          return;
        }
        if (thread.messages.length === 0) {
          if (hydrationRequestRef.current === threadIdParam) return;
          hydrationRequestRef.current = threadIdParam;
          runtimeDiagnostics.startTimer('hydration');
          hydrateThreadMessages(threadIdParam)
            .then((hydratedThread) => {
              if (hydrationRequestRef.current !== threadIdParam) return;
              hydrationRequestRef.current = null;
              if (!hydratedThread || hydratedThread.messages.length === 0) {
                removeEmptyThread(threadIdParam);
                return;
              }
              applyHydratedThread(threadIdParam, hydratedThread);
            })
            .catch(() => {
              if (hydrationRequestRef.current === threadIdParam) {
                hydrationRequestRef.current = null;
                removeEmptyThread(threadIdParam);
              }
            });
          return;
        }
        runtimeDiagnostics.startTimer('hydration');
        intendedThreadRef.current = threadIdParam;
        isHydratedRef.current = true;
        setMessages(thread.messages);
        switchThread(threadIdParam);
        runtimeDiagnostics.recordTimed('hydration_complete', 'hydration', { threadId: threadIdParam });
      } else if (threadsReady) {
        if (hydrationRequestRef.current === threadIdParam) return;
        hydrationRequestRef.current = threadIdParam;
        runtimeDiagnostics.startTimer('hydration');
        hydrateThreadMessages(threadIdParam)
          .then((hydratedThread) => {
            if (hydrationRequestRef.current !== threadIdParam) return;
            hydrationRequestRef.current = null;
            if (!hydratedThread || hydratedThread.messages.length === 0) {
              removeEmptyThread(threadIdParam);
              return;
            }
            applyHydratedThread(threadIdParam, hydratedThread);
          })
          .catch(() => {
            if (hydrationRequestRef.current === threadIdParam) {
              hydrationRequestRef.current = null;
              removeEmptyThread(threadIdParam);
            }
          });
      }
      // else: first load still in flight — stay and wait
    } else {
      intendedThreadRef.current = null;
      isHydratedRef.current = false;
      setMessages([]);
      setCurrentThreadId(null);
    }
  }, [authLoading, threadsLoading, threadsReady, threadIdParam, getThread, hydrateThreadMessages, setMessages, switchThread, setCurrentThreadId, navigate, removeEmptyThread, applyHydratedThread, threads]);

  // ── Reset title guard when active thread changes ────────────────────────────
  useEffect(() => {
    titleGeneratedRef.current = null;
  }, [threadIdParam]);

  // ── Return greeting fetch ─────────────────────────────────────────────────────
  // Fires when the user opens a thread after a qualifying gap.
  // Runs after hydration (isHydratedRef) so thread.messages.length is accurate.
  // Suppresses for: too-short gap, too-few messages, >7 days (MVP limit), or
  // when the server finds no specific proper noun to reference.
  useEffect(() => {
    if (!threadIdParam || authLoading || threadsLoading) return;

    // Clear any greeting from the previous thread immediately on switch.
    if (greetingThreadRef.current !== threadIdParam) {
      setGreetingMessage(null);
      greetingThreadRef.current = threadIdParam;
    }

    const thread = getThread(threadIdParam);
    if (!thread) return;

    // Client-side gates — mirror the server gates to avoid a wasted round-trip.
    const gapHours = (Date.now() - new Date(thread.updatedAt).getTime()) / 3_600_000;
    if (gapHours < GREETING_MIN_GAP_HOURS) return;
    if (gapHours > GREETING_MAX_GAP_HOURS) return;
    if (thread.messages.length < GREETING_MIN_MSG_COUNT) return;

    // Fetch the greeting. Fire-and-forget — failures silently produce null.
    fetchJson<{ success: boolean; greeting: string | null }>(
      `/api/conversation/greeting/${threadIdParam}?gapHours=${gapHours.toFixed(2)}`
    )
      .then(({ greeting }) => {
        // Only apply if the user is still on the same thread.
        if (greetingThreadRef.current === threadIdParam && greeting) {
          setGreetingMessage(greeting);
        }
      })
      .catch(() => {
        // Never surface greeting errors to the user.
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadIdParam, threadsLoading, authLoading]);

  // ── Auto-create thread on first message (on /chat with no threadId) ─────────
  useEffect(() => {
    if (!threadIdParam && messages.length > 0 && !pendingNewThreadRef.current) {
      pendingNewThreadRef.current = true;
      const id = createThread();
      runtimeDiagnostics.record('thread_create', { threadId: id });
      const firstUser = messages.find((m) => m.role === 'user');
      const provisionalTitle = firstUser
        ? deriveTitleFromFirstUserMessage(firstUser.content)
        : undefined;
      intendedThreadRef.current = id;
      isHydratedRef.current = true;
      updateThread(id, {
        messages,
        ...(provisionalTitle ? { title: provisionalTitle } : {}),
        updatedAt: new Date().toISOString(),
      });
      navigate(`/chat/${id}`, { replace: true });
    }
    if (threadIdParam) pendingNewThreadRef.current = false;
  }, [threadIdParam, messages.length, messages, createThread, updateThread, navigate]);

  // ── Sync in-memory messages → thread store ──────────────────────────────────
  // Uses intendedThreadRef (not threadIdParam) as the target so intermediate
  // renders during navigation never write to the wrong thread.
  useEffect(() => {
    const tid = intendedThreadRef.current;
    if (!tid || !isHydratedRef.current) return;
    runtimeDiagnostics.record('sync_write', { threadId: tid });
    updateThread(tid, { messages, updatedAt: new Date().toISOString() });
  }, [messages, updateThread]);

  // ── Semantic title generation ───────────────────────────────────────────────
  useEffect(() => {
    if (!threadIdParam) return;

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isStreaming) return;

    const hasExchange =
      messages.some((m) => m.role === 'user') && messages.some((m) => m.role === 'assistant');
    if (!hasExchange) return;

    if (titleGeneratedRef.current === threadIdParam) return;

    const currentThread = getThread(threadIdParam);
    if (currentThread?.title && !isGenericThreadTitle(currentThread.title)) {
      runtimeDiagnostics.record('title_skip', { threadId: threadIdParam, meta: { reason: 'already_titled' } });
      return;
    }

    titleGeneratedRef.current = threadIdParam;
    runtimeDiagnostics.record('title_start', { threadId: threadIdParam });
    runtimeDiagnostics.startTimer(`title_${threadIdParam}`);

    const payload = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, 6)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.isStreaming);
    const modeDecision = lastAssistant?.modeDecision?.mode;

    fetchJson<TitleGenerationResult & { success: boolean }>(
      `/api/conversation/threads/${threadIdParam}/title`,
      {
        method: 'POST',
        body: JSON.stringify({
          messages: payload,
          ...(modeDecision ? { modeDecision } : {}),
        }),
      }
    )
      .then(({ title, subtitle, dominantEntities }) => {
        runtimeDiagnostics.recordTimed('title_complete', `title_${threadIdParam}`, {
          threadId: threadIdParam,
          meta: { title },
        });
        if (title && !isGenericThreadTitle(title)) {
          updateThread(threadIdParam, { title, subtitle, ...(dominantEntities ? { dominantEntities } : {}) });
        }
      })
      .catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        runtimeDiagnostics.recordTimed('title_error', `title_${threadIdParam}`, {
          threadId: threadIdParam,
          meta: { error: errMsg },
        });
        // Title generation failure is non-fatal — the thread keeps its provisional title.
        // The error is logged via runtimeDiagnostics (visible in dev console).
      });
  }, [threadIdParam, messages, getThread, updateThread]);

  // ── Navigation helpers ──────────────────────────────────────────────────────

  /** Start a new chat: flush current thread, create new thread, navigate */
  const handleNewChat = useCallback(() => {
    if (currentThreadId) {
      runtimeDiagnostics.record('flush_save', { threadId: currentThreadId });
      flushSave(currentThreadId);
    }
    clearMessages();
    const id = createThread();
    runtimeDiagnostics.record('thread_create', { threadId: id });
    intendedThreadRef.current = id;
    isHydratedRef.current = true;
    hydratedByHandlerRef.current = id; // thread is empty — skip URL hydration setMessages
    navigate(`/chat/${id}`);
  }, [currentThreadId, flushSave, clearMessages, createThread, navigate]);

  /** Switch to an existing thread: flush current, load messages, navigate */
  const handleSelectThread = useCallback(
    async (id: string) => {
      if (currentThreadId && currentThreadId !== id) {
        runtimeDiagnostics.record('flush_save', { threadId: currentThreadId });
        flushSave(currentThreadId);
      }
      runtimeDiagnostics.startTimer('thread_switch');
      let thread = getThread(id);
      intendedThreadRef.current = id;
      isHydratedRef.current = false;
      hydratedByHandlerRef.current = id;
      // Always clear first so stale messages from the previous thread never bleed
      // into the new thread's view during the navigation transition.
      clearMessages();
      if (!thread || thread.messages.length === 0) {
        const hydratedThread = await hydrateThreadMessages(id);
        if (hydratedThread) thread = hydratedThread;
      }
      if (!thread || thread.messages.length === 0) {
        removeEmptyThread(id);
        runtimeDiagnostics.recordTimed('thread_switch', 'thread_switch', {
          threadId: id,
          meta: { result: 'empty_deleted' },
        });
        return;
      }
      intendedThreadRef.current = id;
      isHydratedRef.current = true;
      hydratedByHandlerRef.current = id;
      setMessages(thread.messages);
      switchThread(id);
      navigate(`/chat/${id}`);
      runtimeDiagnostics.recordTimed('thread_switch', 'thread_switch', { threadId: id });
    },
    [currentThreadId, flushSave, getThread, clearMessages, hydrateThreadMessages, setMessages, switchThread, navigate, removeEmptyThread]
  );

  /** Delete a thread: remove it and navigate to the next available thread or /chat */
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
          setMessages(next.messages);
          navigate(`/chat/${next.id}`);
        } else if (next) {
          intendedThreadRef.current = next.id;
          isHydratedRef.current = false;
          hydratedByHandlerRef.current = next.id;
          clearMessages();
          navigate(`/chat/${next.id}`);
        } else {
          intendedThreadRef.current = null;
          isHydratedRef.current = false;
          clearMessages();
          navigate('/chat');
        }
      }
    },
    [threads, deleteThread, threadIdParam, setMessages, navigate, hydrateThreadMessages, clearMessages]
  );

  /** Fork the current thread from a given message, navigate to the new thread */
  const forkThread = useCallback(
    async (fromMessageId?: string) => {
      const sourceId = threadIdParam ?? currentThreadId;
      if (!sourceId) return;
      try {
        await flushSave(sourceId);
        const res = await fetchJson<{ success: boolean; thread: { id: string } }>(
          `/api/conversation/threads/${sourceId}/fork`,
          { method: 'POST', body: JSON.stringify({ message_id: fromMessageId }) }
        );
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

  /** Dismiss the return greeting (called when user sends their first message). */
  const clearGreeting = useCallback(() => {
    setGreetingMessage(null);
  }, []);

  return {
    threads,
    threadsLoading,
    threadsReady,
    /** The canonical active thread id (URL param takes priority over store) */
    activeThreadId: threadIdParam ?? currentThreadId,
    activeThread: threadIdParam ? getThread(threadIdParam) : null,

    /** Ephemeral return greeting — never persisted, cleared on first user message. */
    greetingMessage,
    clearGreeting,

    handleNewChat,
    handleSelectThread,
    handleDeleteThread,
    renameThread,
    updateThread,
    flushSave,
    getThread,
    forkThread,
  };
};
