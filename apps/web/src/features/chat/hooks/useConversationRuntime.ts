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

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../lib/supabase';
import { fetchJson } from '../../../lib/api';
import { useChatThreads } from './useChatThreads';
import { runtimeDiagnostics } from '../services/runtimeDiagnostics';
import type { Message } from '../message/ChatMessage';
import type { TitleGenerationResult } from '../types/conversationMetadata';

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
    switchThread,
    updateThread,
    renameThread,
    deleteThread,
    flushSave,
  } = useChatThreads();

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

  // ── URL-driven hydration ────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || threadsLoading) return;
    if (threadIdParam) {
      // Handler already loaded this thread — skip to avoid double setMessages
      if (hydratedByHandlerRef.current === threadIdParam) {
        runtimeDiagnostics.record('hydration_skip', { threadId: threadIdParam });
        hydratedByHandlerRef.current = null;
        return;
      }
      const thread = getThread(threadIdParam);
      if (thread) {
        // Guard: already hydrated on this thread. getThread changes identity whenever
        // threads state updates (each streaming chunk → updateThread → threads change →
        // getThread new ref → this effect re-runs). Without this guard the hydration
        // effect fires ~20× per message, writing stale stored messages back into live
        // state and causing a cascade of debounced saves.
        if (isHydratedRef.current && intendedThreadRef.current === threadIdParam) {
          runtimeDiagnostics.record('hydration_skip', { threadId: threadIdParam, meta: { reason: 'already_active' } });
          return;
        }
        runtimeDiagnostics.startTimer('hydration');
        intendedThreadRef.current = threadIdParam;
        isHydratedRef.current = true;
        setMessages(thread.messages);
        switchThread(threadIdParam);
        runtimeDiagnostics.recordTimed('hydration_complete', 'hydration', { threadId: threadIdParam });
      } else if (threadsReady) {
        navigate('/chat', { replace: true });
      }
      // else: first load still in flight — stay and wait
    } else {
      intendedThreadRef.current = null;
      isHydratedRef.current = false;
      setMessages([]);
      setCurrentThreadId(null);
    }
  }, [authLoading, threadsLoading, threadsReady, threadIdParam, getThread, setMessages, switchThread, setCurrentThreadId, navigate]);

  // ── Reset title guard when active thread changes ────────────────────────────
  useEffect(() => {
    titleGeneratedRef.current = null;
  }, [threadIdParam]);

  // ── Auto-create thread on first message (on /chat with no threadId) ─────────
  useEffect(() => {
    if (!threadIdParam && messages.length > 0 && !pendingNewThreadRef.current) {
      pendingNewThreadRef.current = true;
      const id = createThread();
      runtimeDiagnostics.record('thread_create', { threadId: id });
      const firstUser = messages.find((m) => m.role === 'user');
      const provisionalTitle = firstUser
        ? firstUser.content.slice(0, 50).trim() || 'New chat'
        : 'New chat';
      intendedThreadRef.current = id;
      isHydratedRef.current = true;
      updateThread(id, { messages, title: provisionalTitle, updatedAt: new Date().toISOString() });
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
    if (currentThread?.title && currentThread.title !== 'New chat') {
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
      .then(({ title, subtitle }) => {
        runtimeDiagnostics.recordTimed('title_complete', `title_${threadIdParam}`, {
          threadId: threadIdParam,
          meta: { title },
        });
        if (title && title !== 'New chat') {
          updateThread(threadIdParam, { title, subtitle });
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
    (id: string) => {
      if (currentThreadId && currentThreadId !== id) {
        runtimeDiagnostics.record('flush_save', { threadId: currentThreadId });
        flushSave(currentThreadId);
      }
      runtimeDiagnostics.startTimer('thread_switch');
      const thread = getThread(id);
      if (thread) {
        // Set intendedThreadRef BEFORE setMessages to prevent sync contamination
        // during the intermediate render between setMessages and navigate processing.
        intendedThreadRef.current = id;
        isHydratedRef.current = true;
        hydratedByHandlerRef.current = id;
        setMessages(thread.messages);
      }
      switchThread(id);
      navigate(`/chat/${id}`);
      runtimeDiagnostics.recordTimed('thread_switch', 'thread_switch', { threadId: id });
    },
    [currentThreadId, flushSave, getThread, setMessages, switchThread, navigate]
  );

  /** Delete a thread: remove it and navigate to the next available thread or /chat */
  const handleDeleteThread = useCallback(
    (id: string) => {
      const remaining = threads.filter((t) => t.id !== id);
      const next = remaining[0];
      runtimeDiagnostics.record('thread_delete', { threadId: id });
      deleteThread(id);
      if (threadIdParam === id) {
        if (next) {
          intendedThreadRef.current = next.id;
          isHydratedRef.current = true;
          hydratedByHandlerRef.current = next.id;
          setMessages(next.messages);
          navigate(`/chat/${next.id}`);
        } else {
          intendedThreadRef.current = null;
          isHydratedRef.current = false;
          setMessages([]);
          navigate('/chat');
        }
      }
    },
    [threads, deleteThread, threadIdParam, setMessages, navigate]
  );

  return {
    threads,
    threadsLoading,
    threadsReady,
    /** The canonical active thread id (URL param takes priority over store) */
    activeThreadId: threadIdParam ?? currentThreadId,
    activeThread: threadIdParam ? getThread(threadIdParam) : null,

    handleNewChat,
    handleSelectThread,
    handleDeleteThread,
    renameThread,
    updateThread,
    flushSave,
    getThread,
  };
};
