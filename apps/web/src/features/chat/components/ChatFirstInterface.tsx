import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setIsMobile(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

import { useChat } from '../hooks/useChat';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useConversationRuntime } from '../hooks/useConversationRuntime';
import { Search as SearchIcon, MessageSquareText, Brain, Menu, SquarePen, UserCircle, BookOpen, Check as CheckIcon, Clipboard as ClipboardIcon } from 'lucide-react';
import { useLocalStorage } from '../../../hooks/useLocalStorage';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessageList } from '../message/ChatMessageList';
import { MessageCorrectionModal } from '../message/MessageCorrectionModal';
import { useMessageCorrection } from '../hooks/useMessageCorrection';
import { ChatLoadingPulse } from './ChatLoadingPulse';
import { ChatComposer } from '../composer/ChatComposer';
import { ThreadEntityChips } from './ThreadEntityChips';
import { ChatFocusChipBar } from './ChatFocusChipBar';
import { ChatFocusArrivalToast } from './ChatFocusArrivalToast';
import { LoreBookNoticeHost } from '../../../components/chat/LoreBookNoticeHost';
import { ThreadSummaryBar } from './ThreadSummaryBar';
import { collectThreadEntities, toEntityContext } from '../utils/collectThreadEntities';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import { ChatSourcesBar } from '../sources/ChatSourcesBar';
import { ChatSourceNavigator } from '../sources/ChatSourceNavigator';
import { ChatSearchModal } from '../search/ChatSearchModal';
import { ChatThreadList } from './ChatThreadList';
import { GuestSignUpPrompt } from '../../../components/guest/GuestSignUpPrompt';
import { GuestExperienceCard } from '../../../components/guest/GuestExperienceCard';
import { CurrentContextBreadcrumbs } from '../../../components/CurrentContextBreadcrumbs';
import { useGuest } from '../../../contexts/GuestContext';
import { WorkSummaryImporter } from '../../../components/work/WorkSummaryImporter';
import { useMockData } from '../../../contexts/MockDataContext';
import { diagnoseEndpoints, logDiagnostics } from '../../../utils/errorDiagnostics';
import { analytics } from '../../../lib/monitoring';
import { fetchJson } from '../../../lib/api';
import { invalidateEntityTags } from '../../../store/invalidateEntityCache';
import { useLoreKeeper } from '../../../hooks/useLoreKeeper';
import { dispatchStoryDataUpdated } from '../../../lib/storyRefresh';
import type { UploadCompletePayload } from './DocumentUpload';
import { ThreadSaveChip } from './ThreadSaveChip';
import { WhatLoreBookKnows } from './WhatLoreBookKnows';
import { WhatChangedSinceLastTime } from './WhatChangedSinceLastTime';
import { ActiveContextPanel } from './ActiveContextPanel';
import { ChronologyNarrativeModal } from './ChronologyNarrativeModal';
import { Logo } from '../../../components/Logo';
import { useAuth } from '../../../lib/supabase';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { clearChatFocus } from '../../../store/slices/selectionSlice';
import { selectChatFocus } from '../../../store/selectors';
import { focusToComposerEntities, focusToEntityContext } from '../../../lib/chatFocusUtils';
import type { ChatSource, ChatSuggestedAction, Message } from '../message/ChatMessage';
import '../styles/chat-theme.css';
import '../styles/message-animations.css';

// A persisted message carries its real chat_messages UUID; synthetic live ids
// look like "user-1719…", "error-…", etc. Only persisted messages can be
// corrected (the server row + its derived knowledge must exist to re-derive).
const PERSISTED_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ChatFirstInterface = ({ onOpenAppSidebar }: { onOpenAppSidebar?: () => void } = {}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const chatFocus = useAppSelector(selectChatFocus);

  // ── Message state (owned by useChat / useConversationStore) ──────────────────
  const { refreshEntries, refreshTimeline, refreshChapters } = useLoreKeeper();

  const {
    messages,
    setMessages,
    sendMessage,
    isLoading,
    loadingStage,
    loadingProgress,
    streamingMessageId,
    sources,
    clearConversation,
    messageRefs,
    registerMessageRef,
  } = useChat();

  // ── Thread lifecycle (owned by useConversationRuntime) ────────────────────────
  const {
    threads,
    activeThreadId,
    handleNewChat: handleNewChatBase,
    handleSelectThread,
    handleDeleteThread: handleDeleteThreadBase,
    renameThread,
    forkThread,
    greetingMessage,
    clearGreeting,
    threadsHasMore,
    threadsTotal,
    threadsLoading,
    threadsLoadingMore,
    loadMoreThreads,
    lastError,
    dismissThreadError,
  } = useConversationRuntime();

  // Build the display list: prepend the ephemeral greeting when present.
  // greetingMessage is never persisted — it lives only in runtime state.
  const greetingDisplayMsg = greetingMessage
    ? ({
        id: `greeting-${activeThreadId}`,
        role: 'assistant' as const,
        content: greetingMessage,
        timestamp: new Date(),
        metadata: { intent: 'return_greeting' },
      })
    : null;

  const displayMessages = greetingDisplayMsg
    ? [greetingDisplayMsg, ...messages]
    : messages;

  const activeThreadMeta = useMemo(
    () => threads.find((t) => t.id === activeThreadId),
    [threads, activeThreadId]
  );
  const isHydratingThreadMessages =
    !!activeThreadId &&
    messages.length === 0 &&
    (activeThreadMeta?.messageCount ?? 0) > 0;

  const threadEntities = useMemo(() => collectThreadEntities(messages), [messages]);
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);

  useEffect(() => {
    setFocusedEntityId(null);
  }, [activeThreadId]);

  const chatSendOptions = useMemo(() => {
    const focused = focusedEntityId
      ? threadEntities.find((e) => e.id === focusedEntityId)
      : undefined;
    const focusEntityContext = chatFocus ? focusToEntityContext(chatFocus) : undefined;
    const focusComposer = chatFocus ? focusToComposerEntities(chatFocus) : undefined;
    return {
      entityContext: focused ? toEntityContext(focused) : focusEntityContext,
      threadEntities,
      chatFocus: chatFocus ?? undefined,
      composerEntities: focusComposer,
    };
  }, [focusedEntityId, threadEntities, chatFocus]);

  // Wrap sendMessage: clear the greeting and track analytics before sending.
  const handleSubmit = (
    msg: string,
    certifiedEntities?: CertifiedEntityMatch[],
    previewCorrections?: import('../../../lib/entityCorrectionTypes').CorrectedPreviewSpan[]
  ) => {
    if (greetingMessage) {
      analytics.track('greeting_responded', {
        threadId: activeThreadId,
        greetingLength: greetingMessage.length,
      });
      clearGreeting();
    }
    sendMessage(msg, {
      ...chatSendOptions,
      composerEntities: certifiedEntities?.length ? certifiedEntities : chatSendOptions.composerEntities,
      previewCorrections,
    });
  };

  const handleRecallPrompt = useCallback(
    (prompt: string) => {
      sendMessage(prompt, chatSendOptions);
    },
    [sendMessage, chatSendOptions]
  );

  // Track greeting_shown when the greeting first appears.
  // greeting_responded is tracked inside handleSubmit above.
  useEffect(() => {
    if (!greetingMessage || !activeThreadId) return;
    analytics.track('greeting_shown', { threadId: activeThreadId });
  }, [greetingMessage, activeThreadId]);

  const { isGuest, canSendChatMessage } = useGuest();
  const { backendUnavailable } = useMockData();
  const { user } = useAuth();
  const avatarUrl: string | undefined = user?.user_metadata?.avatar_url;
  const avatarInitial: string | null = (() => {
    const name: string = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || '';
    return name ? name.charAt(0).toUpperCase() : null;
  })();

  const [selectedSource, setSelectedSource] = useState<ChatSource | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMessageId, setSearchMessageId] = useState<string | null>(null);

  // Jump to a message when navigating from thread explorer search hits.
  useEffect(() => {
    if (!activeThreadId || messages.length === 0) return;
    const jumpId = sessionStorage.getItem('lk:chat-jump-message');
    if (jumpId) {
      sessionStorage.removeItem('lk:chat-jump-message');
      if (messages.some(m => m.id === jumpId)) {
        setSearchMessageId(jumpId);
        return;
      }
    }
    const jumpIndexRaw = sessionStorage.getItem('lk:chat-jump-index');
    if (jumpIndexRaw != null) {
      sessionStorage.removeItem('lk:chat-jump-index');
      const idx = Number(jumpIndexRaw);
      const target = messages[idx];
      if (target?.id) setSearchMessageId(target.id);
    }
  }, [activeThreadId, messages]);
  const [showWorkSummary, setShowWorkSummary] = useState(false);
  const [correcting, setCorrecting] = useState<{ id: string; content: string } | null>(null);
  const { correctMessage, saving: correctionSaving, error: correctionError } = useMessageCorrection();
  const [showCognitiveTrace] = useLocalStorage<boolean>('lorekeeper_cognitive_trace', false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [initialDate, setInitialDate] = useState<string | null>(null);
  const [focusComposerPulse, setFocusComposerPulse] = useState(false);
  const lastFocusArrivalRef = useRef<number | null>(null);
  const [threadListCollapsed, setThreadListCollapsed] = useState(false);
  const [threadListMobileOpen, setThreadListMobileOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useLocalStorage<boolean>('lorekeeper_context_panel', false);
  const [showNarrative, setShowNarrative] = useState(false);
  const swipeStartX = useRef<number | null>(null);
  const [backendStatus, setBackendStatus] = useState<'ok' | 'degraded' | 'unreachable' | null>(null);
  const [statusDismissed, setStatusDismissed] = useState(false);
  const isMobile = useIsMobile(640);

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = threadListMobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, threadListMobileOpen]);

  // Apply modal → chat prefill when focus is set from another surface
  useEffect(() => {
    if (!chatFocus?.initialPrompt) return;
    setInitialPrompt(chatFocus.initialPrompt);
  }, [chatFocus?.entityId, chatFocus?.sourceSurface, chatFocus?.initialPrompt]);

  // Pulse composer when focus arrives from a modal (demo + live)
  useEffect(() => {
    if (!chatFocus?.arrivedAt) return;
    if (lastFocusArrivalRef.current === chatFocus.arrivedAt) return;
    lastFocusArrivalRef.current = chatFocus.arrivedAt;
    setFocusComposerPulse(true);
    const timer = window.setTimeout(() => setFocusComposerPulse(false), 2600);
    return () => window.clearTimeout(timer);
  }, [chatFocus?.arrivedAt, chatFocus?.entityId, chatFocus?.sourceSurface]);

  // ── URL search param pre-fill (date / prompt) ─────────────────────────────────
  useEffect(() => {
    const dateParam = searchParams.get('date');
    const promptParam = searchParams.get('prompt');
    if (dateParam) setInitialDate(dateParam);
    if (promptParam) {
      setInitialPrompt(decodeURIComponent(promptParam));
      const next = new URLSearchParams(searchParams);
      next.delete('date');
      next.delete('prompt');
      navigate({ search: next.toString() }, { replace: true });
    }
  }, [searchParams, navigate]);

  // ── Health check (once per session, skip if global offline already known) ───
  const healthWarnedRef = useRef(false);
  useEffect(() => {
    if (backendUnavailable) return;
    const checkHealth = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${apiBase}/api/health`);
        if (!response.ok && !healthWarnedRef.current) {
          healthWarnedRef.current = true;
          if (response.status === 503) {
            const body = await response.json().catch(() => ({}));
            if (body.error === 'Database schema incomplete' || Array.isArray(body.missingTables)) {
              setBackendStatus('degraded');
              return;
            }
          }
          setBackendStatus('degraded');
        }
      } catch {
        if (!healthWarnedRef.current) {
          healthWarnedRef.current = true;
          setBackendStatus('unreachable');
        }
      }
    };
    checkHealth();
  }, [backendUnavailable]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useKeyboardShortcuts({
    onSearch: () => setShowSearch((s) => !s),
    onCommands: () => {
      const textarea = document.querySelector('textarea[placeholder*="Message Lore Book"]') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.value = '/';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    onDiagnostics: () => { diagnoseEndpoints('/api').then(logDiagnostics); },
    onEscape: () => {
      if (showSearch) setShowSearch(false);
      if (selectedSource) setSelectedSource(null);
    },
  });

  // ── Thread action wrappers (close mobile drawer before navigating) ────────────
  const handleNewChat = () => {
    setThreadListMobileOpen(false);
    handleNewChatBase();
  };

  const handleDeleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    handleDeleteThreadBase(id);
  };

  // ── Source handling ───────────────────────────────────────────────────────────
  const handleSourceClick = (source: ChatSource) => {
    setSelectedSource(source);
    analytics.track('chat_source_clicked', { sourceType: source.type, sourceId: source.id });
  };

  const handleNavigateToSource = (surface: 'timeline' | 'characters' | 'memoir' | 'lorebook', id?: string) => {
    setSelectedSource(null);
    const routeMap: Record<string, string> = {
      entry: '/timeline', chapter: '/timeline', character: '/characters',
      location: '/locations', task: '/timeline', hqi: '/timeline?view=search', fabric: '/discovery',
    };
    navigate(routeMap[surface] || '/timeline');
    analytics.track('chat_source_navigated', { surface, id });
    if (id) sessionStorage.setItem('highlightItem', id);
  };

  // ── Message actions ───────────────────────────────────────────────────────────
  const handleCopy = (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (message) {
      navigator.clipboard.writeText(message.content);
      analytics.track('chat_message_copied', { messageId, role: message.role });
    }
  };

  const handleRegenerate = async (messageId: string) => {
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;
    const userMessage = messages[messageIndex - 1];
    if (!userMessage || userMessage.role !== 'user') return;
    analytics.track('chat_message_regenerated', { messageId });
    const index = messages.findIndex((m) => m.id === messageId);
    if (index >= 0) {
      setMessages(messages.slice(0, index));
      setTimeout(() => { sendMessage(userMessage.content, chatSendOptions); }, 100);
    }
  };

  const handleEdit = (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message || message.role !== 'user') return;
    analytics.track('chat_message_edited', { messageId });

    // Persisted messages (real chat_messages UUID) are *corrected* — the edit
    // re-derives what Lore Book knows. Unsaved live messages (synthetic ids like
    // "user-…") keep the old truncate-and-resend behaviour.
    if (PERSISTED_MESSAGE_ID.test(message.id)) {
      setCorrecting({ id: message.id, content: message.content });
      return;
    }

    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex >= 0) {
      setMessages(messages.slice(0, messageIndex));
      const textarea = document.querySelector('textarea[placeholder*="Message Lore Book"]') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.value = message.content;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  };

  const handleSaveCorrection = async (newContent: string, reason?: string) => {
    if (!correcting) return;
    const result = await correctMessage(correcting.id, newContent, reason);
    if (result) {
      // Reflect the corrected text in the bubble and refresh derived lore.
      setMessages(messages.map((m) => (m.id === correcting.id ? { ...m, content: newContent } : m)));
      setCorrecting(null);
      void Promise.all([refreshEntries(), refreshTimeline()]);
    }
  };

  const handleDelete = (messageId: string) => {
    analytics.track('chat_message_deleted', { messageId });
    setMessages(messages.filter((m) => m.id !== messageId));
  };

  const handleFeedback = async (messageId: string, feedback: 'positive' | 'negative') => {
    const message = messages.find((m) => m.id === messageId);
    if (message) {
      analytics.track('chat_message_feedback', { messageId, feedback });
      try {
        const context = messages
          .slice(Math.max(0, messages.findIndex((m) => m.id === messageId) - 3))
          .slice(0, 6)
          .map((msg) => ({ role: msg.role, content: msg.content }));
        await fetchJson('/api/chat/feedback', {
          method: 'POST',
          body: JSON.stringify({ messageId, feedback, message: message.content, conversationContext: context }),
        });
      } catch (error) {
        console.error('Failed to send feedback:', error);
      }
    }
  };

  const handleSearchResultClick = (messageId: string) => {
    setSearchMessageId(messageId);
  };

  const prefillComposer = (prompt: string) => {
    setInitialPrompt(prompt);
    const textarea = document.querySelector('textarea[placeholder*="Message Lore Book"]') as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.focus();
      textarea.value = prompt;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const handleSuggestedAction = (action: ChatSuggestedAction, message: Message) => {
    analytics.track('chat_suggested_action_clicked', {
      actionId: action.id,
      actionKind: action.kind,
      messageId: message.id,
    });

    const appendSystemNote = (content: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          role: 'assistant' as const,
          content,
          timestamp: new Date(),
          isSystemMessage: true,
        },
      ]);
    };

    if (action.kind === 'crud_confirm' && action.apiPath) {
      void (async () => {
        try {
          await fetchJson(action.apiPath!, {
            method: action.apiMethod ?? 'POST',
            ...(action.apiBody ? { body: JSON.stringify(action.apiBody) } : {}),
          });
          invalidateEntityTags(['Character']);
          appendSystemNote(action.successMessage ?? 'Updated your lore.');
        } catch (error) {
          appendSystemNote(
            error instanceof Error ? error.message : 'Could not complete that action.',
          );
        }
      })();
      return;
    }

    if (action.kind === 'navigate') {
      if (action.surface === 'family') {
        navigate('/family');
        return;
      }
      if (action.targetId) {
        sessionStorage.setItem('highlightItem', action.targetId);
      }
      navigate('/characters');
      return;
    }

    if (action.kind === 'open_sources') {
      const source = action.targetId
        ? message.sources?.find((s) => s.id === action.targetId)
        : message.sources?.[0];
      if (source) handleSourceClick(source);
      return;
    }

    if (action.kind === 'search') {
      const query = action.query || message.content.slice(0, 160);
      navigate(`/timeline?view=search&q=${encodeURIComponent(query)}`);
      return;
    }

    if (action.kind === 'fork') {
      forkThread(message.id);
      return;
    }

    if (action.prompt) {
      prefillComposer(action.prompt);
    }
  };

  const [conversationCopied, setConversationCopied] = useState(false);
  const handleCopyConversation = () => {
    if (messages.length === 0) return;
    const text = messages
      .map((m) => `${m.role === 'user' ? 'You' : 'LoreBook'}: ${m.content}`)
      .join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setConversationCopied(true);
      setTimeout(() => setConversationCopied(false), 2000);
    });
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] lg:h-full bg-black w-full overflow-hidden">
      <ChatThreadList
        threads={threads}
        currentThreadId={activeThreadId}
        onNewChat={handleNewChat}
        onSelectThread={(id, options) => {
          if (options?.messageId) {
            sessionStorage.setItem('lk:chat-jump-message', options.messageId);
          } else if (options?.messageIndex != null) {
            sessionStorage.setItem('lk:chat-jump-index', String(options.messageIndex));
          }
          setThreadListMobileOpen(false);
          handleSelectThread(id);
        }}
        onDeleteThread={handleDeleteThread}
        onRenameThread={renameThread}
        collapsed={threadListCollapsed}
        onToggleCollapsed={() => setThreadListCollapsed((c) => !c)}
        mobileOpen={threadListMobileOpen}
        onMobileClose={() => setThreadListMobileOpen(false)}
        isMobile={isMobile}
        hasMoreThreads={threadsHasMore}
        threadsTotal={threadsTotal}
        loadingMoreThreads={threadsLoadingMore}
        onLoadMoreThreads={() => void loadMoreThreads()}
        threadError={lastError}
        onDismissThreadError={dismissThreadError}
      />

      <div
        className="flex flex-col flex-1 min-w-0 relative chat-container overflow-hidden"
        onTouchStart={isMobile ? (e) => {
          const touch = e.touches[0];
          if (touch.clientX < 24 && !threadListMobileOpen) {
            swipeStartX.current = touch.clientX;
          }
        } : undefined}
        onTouchMove={isMobile ? (e) => {
          if (swipeStartX.current === null) return;
          if (e.touches[0].clientX - swipeStartX.current > 60) {
            setThreadListMobileOpen(true);
            swipeStartX.current = null;
          }
        } : undefined}
        onTouchEnd={isMobile ? () => { swipeStartX.current = null; } : undefined}
      >
        {/* Header */}
        <div className="border-b border-white/10 bg-black/40 backdrop-blur-sm px-3 sm:px-4 py-3 sm:py-2 flex items-center justify-between flex-shrink-0 gap-2" style={{ paddingTop: 'env(safe-area-inset-top, 0.75rem)' }}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isMobile && (
              <button
                type="button"
                onClick={() => setThreadListMobileOpen(true)}
                className="relative flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
                aria-label="Chat history"
              >
                <MessageSquareText className="h-5 w-5" />
                {threads.length > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary/80" />
                )}
              </button>
            )}
            {isMobile ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Logo size="xs" showText={false} />
                <div className="flex items-baseline gap-0.5 leading-none">
                  <span className="text-sm font-bold tracking-widest text-primary drop-shadow-[0_0_6px_rgba(124,58,237,0.7)]">LORE</span>
                  <span className="text-sm font-bold tracking-widest text-gray-300">BOOK</span>
                </div>
              </div>
            ) : (
              <h2 className="text-xs sm:text-sm font-semibold text-white/90 flex-shrink-0">Lore Book</h2>
            )}
            {!isMobile && <CurrentContextBreadcrumbs />}
            <ThreadSaveChip threadId={activeThreadId} />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setContextPanelOpen(!contextPanelOpen)}
              className={`h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors touch-manipulation ${contextPanelOpen ? 'text-indigo-400' : 'text-white/40 hover:text-white/60'}`}
              title={contextPanelOpen ? 'Hide active context' : 'Show active context — why is LoreBook talking about this?'}
            >
              <Brain className="h-4 w-4" />
            </button>
            {!isMobile && (
              <button
                type="button"
                onClick={() => setShowNarrative(true)}
                className="text-white/40 hover:text-purple-300 h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors touch-manipulation"
                title="Generate your story — Chronology Narrative"
              >
                <BookOpen className="h-4 w-4" />
              </button>
            )}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleCopyConversation}
                className={`h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors touch-manipulation ${conversationCopied ? 'text-green-400' : 'text-white/40 hover:text-white/70'}`}
                title={conversationCopied ? 'Copied!' : 'Copy full conversation'}
              >
                {conversationCopied
                  ? <CheckIcon className="h-4 w-4" />
                  : <ClipboardIcon className="h-4 w-4" />}
              </button>
            )}
            {!isMobile && (
              <button
                type="button"
                onClick={() => setShowSearch(!showSearch)}
                className="text-white/60 hover:text-white h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors touch-manipulation"
                title="Search conversation (⌘K)"
              >
                <SearchIcon className="h-4 w-4 sm:h-4 sm:w-4" />
              </button>
            )}
            {!isMobile && (
              <button
                type="button"
                onClick={handleNewChat}
                className="h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
                title="New chat"
                aria-label="New chat"
              >
                <SquarePen className="h-4 w-4" />
              </button>
            )}
            {isMobile && onOpenAppSidebar && (
              <button
                type="button"
                onClick={onOpenAppSidebar}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
                aria-label="App menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            {isMobile && (
              <div className="h-8 w-8 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center border border-white/20 bg-white/8 ml-0.5">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : avatarInitial ? (
                  <span className="text-xs font-semibold text-primary">{avatarInitial}</span>
                ) : (
                  <UserCircle className="h-5 w-5 text-white/30" />
                )}
              </div>
            )}
          </div>
        </div>

        {isGuest && messages.length === 0 && (
          <GuestExperienceCard variant="compact" showEndSession={false} />
        )}

        {/* Runtime status banner — hidden when global offline bar is already shown */}
        {backendStatus && !statusDismissed && !backendUnavailable && (
          <div className={`flex items-center justify-between px-3 flex-shrink-0 ${
            isMobile ? 'py-1 text-[10px]' : 'py-2 text-xs'
          } ${
            backendStatus === 'unreachable'
              ? 'bg-red-900/30 border-b border-red-500/20 text-red-300/90'
              : 'bg-yellow-900/25 border-b border-yellow-500/15 text-yellow-300/90'
          }`}>
            <span className="truncate">
              {backendStatus === 'unreachable'
                ? (isMobile ? 'Offline mode' : 'Cannot reach server — offline mode')
                : (isMobile ? 'Limited mode' : 'Server degraded — some features limited')}
            </span>
            <button
              type="button"
              onClick={() => setStatusDismissed(true)}
              className="ml-2 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0 p-1"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Chronology Narrative Modal */}
        {showNarrative && (
          <ChronologyNarrativeModal onClose={() => setShowNarrative(false)} />
        )}

        <ChatFocusArrivalToast focus={chatFocus} />
        {!isGuest ? <LoreBookNoticeHost /> : null}

        {/* Search Modal */}
        {showSearch && (
          <ChatSearchModal
            messages={messages}
            isOpen={showSearch}
            onResultClick={handleSearchResultClick}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* Correct a previously-sent message (re-derives knowledge) */}
        {correcting && (
          <MessageCorrectionModal
            originalContent={correcting.content}
            saving={correctionSaving}
            error={correctionError}
            onCancel={() => setCorrecting(null)}
            onSave={handleSaveCorrection}
          />
        )}

        {/* Work Summary Importer */}
        {showWorkSummary && (
          <WorkSummaryImporter
            onClose={() => setShowWorkSummary(false)}
            onSuccess={async () => {
              await Promise.all([refreshEntries(), refreshTimeline(), refreshChapters()]);
            }}
          />
        )}

        {/* Source Navigator */}
        {selectedSource && (
          <ChatSourceNavigator
            source={selectedSource}
            onClose={() => setSelectedSource(null)}
            onNavigateToSurface={handleNavigateToSource}
          />
        )}

        {/* What Changed Since Last Time — proves continuity before the user types anything */}
        <WhatChangedSinceLastTime thread={threads.find(t => t.id === activeThreadId)} />

        <ThreadSummaryBar
          threadId={activeThreadId}
          messageCount={messages.length}
          isMobile={isMobile}
          onRecallInChat={user ? handleRecallPrompt : undefined}
        />

        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 overflow-y-auto chat-scrollbar">
              {isHydratingThreadMessages || (threadsLoading && !!activeThreadId) ? (
                <div className="flex flex-1 items-center justify-center min-h-[12rem] p-6">
                  <ChatLoadingPulse stage="connecting" progress={35} />
                </div>
              ) : (
                <ChatEmptyState />
              )}
            </div>
          ) : (
            <ChatMessageList
              messages={displayMessages}
              streamingMessageId={streamingMessageId}
              searchMessageId={searchMessageId}
              messageRefs={messageRefs.current}
              showCognitiveTrace={showCognitiveTrace}
              onCopy={handleCopy}
              onRegenerate={handleRegenerate}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onFork={(messageId) => forkThread(messageId)}
              onSourceClick={handleSourceClick}
              onFeedback={handleFeedback}
              onSuggestedAction={handleSuggestedAction}
              onPrefillComposer={prefillComposer}
              registerMessageRef={registerMessageRef}
            />
          )}

          {isLoading && !streamingMessageId && (
            <div className="flex-shrink-0">
              <ChatLoadingPulse stage={loadingStage} progress={loadingProgress} />
            </div>
          )}

          {messages.length > 0 && (
            <div className="flex-shrink-0">
              <ChatSourcesBar sources={sources} onSourceClick={handleSourceClick} />
            </div>
          )}

          {isGuest && !canSendChatMessage() && (
            <div className="px-4 pb-4 flex-shrink-0">
              <GuestSignUpPrompt />
            </div>
          )}
        </div>

        {/* What LoreBook Knows strip — desktop only; mobile uses context menu */}
        {!contextPanelOpen && !isMobile && <WhatLoreBookKnows />}

        {/* Modal / book focus — character + source section */}
        {chatFocus && (
          <ChatFocusChipBar focus={chatFocus} onDismiss={() => dispatch(clearChatFocus())} />
        )}

        {/* Confirmed thread entities — focus to build on established knowledge */}
        <ThreadEntityChips
          messages={messages}
          variant="composer"
          selectedEntityId={focusedEntityId}
          onSelectEntity={(entity) => setFocusedEntityId(entity?.id ?? null)}
        />

        {/* Composer */}
        <div
          className={`flex-shrink-0 rounded-t-xl transition-shadow ${
            focusComposerPulse
              ? chatFocus?.sourceSurface === 'love'
                ? 'animate-focus-composer-pulse ring-2 ring-pink-500/35'
                : 'animate-focus-composer-pulse ring-2 ring-primary/30'
              : ''
          }`}
        >
          <ChatComposer
            onSubmit={handleSubmit}
            loading={isLoading}
            disabled={isGuest && !canSendChatMessage()}
            initialPrompt={initialPrompt}
            initialDate={initialDate}
            threadId={activeThreadId ?? undefined}
            onUploadComplete={async (result: UploadCompletePayload) => {
              const now = new Date();
              if (result.kind === 'resume') {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `upload-user-${now.getTime()}`,
                    role: 'user',
                    content: `📎 Uploaded resume: **${result.fileName}**`,
                    timestamp: now,
                  },
                  {
                    id: `upload-assistant-${now.getTime()}`,
                    role: 'assistant',
                    content: result.chatFeedback,
                    timestamp: now,
                    isSystemMessage: true,
                  },
                ]);
                dispatchStoryDataUpdated({ scopes: ['all'], delayMs: 1500 });
              }
              await Promise.all([refreshEntries(), refreshTimeline(), refreshChapters()]);
            }}
          />
        </div>
      </div>

      {/* Active Context Panel — collapsible right panel */}
      {!isMobile && (
        <ActiveContextPanel
          open={contextPanelOpen}
          onClose={() => setContextPanelOpen(false)}
          lastMessageAt={messages.length}
        />
      )}
    </div>
  );
};
