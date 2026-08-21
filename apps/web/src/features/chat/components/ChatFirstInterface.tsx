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
import { ReturnPointBanner, type ContinueContext } from './ReturnPointBanner';
import { ThreadEntityChips } from './ThreadEntityChips';
import { ChatFocusChipBar } from './ChatFocusChipBar';
import { ChatFocusArrivalToast } from './ChatFocusArrivalToast';
import { LoreBookNoticeHost } from '../../../components/chat/LoreBookNoticeHost';
import {
  CHAT_JUMP_MESSAGE_KEY,
  clearChatThreadJump,
  peekChatJumpHighlightTerms,
  peekChatJumpMessageId,
  peekChatJumpSessionId,
} from '../../../lib/chatThreadJump';
import { ThreadSummaryBar } from './ThreadSummaryBar';
import { ThreadRosterBar } from './ThreadRosterBar';
import { CastTrendsNudge } from './CastTrendsNudge';
import { fetchCastThreads, fetchThreadRoster } from '../../../api/threadRoster';
import { fetchThreadSummary } from '../../../api/threadSummary';
import {
  collectRecentThreadMentions,
  collectThreadEntities,
  toEntityContext,
} from '../utils/collectThreadEntities';
import {
  isCastDisplayWorthy,
  scrubPeopleLabels,
  scrubPlacesLabels,
  scrubSummaryDisplayLine,
} from '../utils/threadSurfaceScrub';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import { isClosedScopeQuery, isFocusEntityRelevant } from '@lorebook/api-contracts';
import { ChatSourcesBar } from '../sources/ChatSourcesBar';
import { ChatSourceNavigator } from '../sources/ChatSourceNavigator';
import { ChatSearchModal } from '../search/ChatSearchModal';
import { ChatThreadList } from './ChatThreadList';
import { ChatSimulationPanel } from './ChatSimulationPanel';
import { useChatLifecycleSimulation } from '../hooks/useChatLifecycleSimulation';
import { GuestSignUpPrompt } from '../../../components/guest/GuestSignUpPrompt';
import { AiBudgetBanner } from '../../../components/chat/AiBudgetBanner';
import { useSubscription } from '../../../hooks/useSubscription';
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
import { demoThreadStorageUserId, isDemoRuntimeActive } from '../../../lib/demoRuntime';
import { useAccountAuthority } from '../../../hooks/useAccountAuthority';
import { useAppDispatch, useAppSelector, useAppStore } from '../../../store/hooks';
import { clearChatFocus } from '../../../store/slices/selectionSlice';
import { selectChatFocus } from '../../../store/selectors';
import {
  selectComposerDraftIsEmpty,
  selectVisibleComposerMatches,
} from '../../../store/selectors/composerSelectors';
import { focusToComposerEntities, focusToEntityContext } from '../../../lib/chatFocusUtils';
import { takePostEventChatHandoff } from '../../../lib/postEventChatHandoff';
import { scrubLegacyComposerPrefill } from '../../../lib/scrubLegacyComposerPrefill';
import { clearComposerDraft } from '../services/storySafetyVault';
import { runtimeDiagnostics } from '../services/runtimeDiagnostics';
import { setComposerDraft } from '../../../store/slices/composerSlice';
import type { ChatSource, ChatSuggestedAction, Message } from '../message/ChatMessage';
import { getLoreAgentTrace } from '../../../api/loreAgents';
import type { ComposerChipDebugPayload } from '../composer/ChatComposer';
import {
  buildChatConversationCopyText,
  buildComposerAndContextDebugSnapshot,
  type ChatMessageDiagnosticSnapshot,
  type ThreadSurfaceDebugSnapshot,
} from '../utils/adminChatDiagnosticExport';
import '../styles/chat-theme.css';
import '../styles/message-animations.css';

// A persisted message carries its real chat_messages UUID; synthetic live ids
// look like "user-1719…", "error-…", etc. Only persisted messages can be
// corrected (the server row + its derived knowledge must exist to re-derive).
const PERSISTED_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadAdminMessageDiagnostics(
  messages: Message[],
): Promise<Record<string, ChatMessageDiagnosticSnapshot>> {
  const persistedUserMessages = messages.filter(
    (message) => message.role === 'user' && PERSISTED_MESSAGE_ID.test(message.id),
  );
  const snapshots: Record<string, ChatMessageDiagnosticSnapshot> = {};

  // Avoid turning Copy all into an unbounded burst of requests on long threads.
  // The existing endpoints remain the authority for each persisted message.
  for (let index = 0; index < persistedUserMessages.length; index += 4) {
    const batch = persistedUserMessages.slice(index, index + 4);
    const results = await Promise.all(
      batch.map(async (message) => {
        const [durability, trace] = await Promise.allSettled([
          fetchJson<unknown>(`/api/chat/messages/${message.id}/durability`),
          getLoreAgentTrace(message.id),
        ]);
        const errors: string[] = [];
        if (durability.status === 'rejected') errors.push('durability_unavailable');
        if (trace.status === 'rejected') errors.push('agent_trace_unavailable');
        return {
          messageId: message.id,
          snapshot: {
            ...(durability.status === 'fulfilled' ? { durability: durability.value } : {}),
            ...(trace.status === 'fulfilled' ? { trace: trace.value } : {}),
            ...(errors.length > 0 ? { errors } : {}),
          },
        };
      }),
    );
    for (const result of results) snapshots[result.messageId] = result.snapshot;
  }

  return snapshots;
}

export const ChatFirstInterface = ({ onOpenAppSidebar }: { onOpenAppSidebar?: () => void } = {}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { authority } = useAccountAuthority();
  const canCopyAdminDiagnostics = authority?.canAccessAdmin === true;
  const { subscription } = useSubscription();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const chatFocus = useAppSelector(selectChatFocus);
  // Only the empty/non-empty transition is needed at render time (see usage
  // below) — subscribing to the raw draft text here would re-render this
  // entire screen (and everything under it) on every keystroke. The live
  // text/matches/slots are read directly from the store on demand in
  // handleCopyConversation instead, since that's a manual, infrequent action.
  const composerDraftIsEmpty = useAppSelector(selectComposerDraftIsEmpty);
  const composerChipDebugRef = useRef<ComposerChipDebugPayload | null>(null);
  const handleComposerChipDebugChange = useCallback((snapshot: ComposerChipDebugPayload) => {
    composerChipDebugRef.current = snapshot;
  }, []);

  // ── Message state (owned by useChat / useConversationStore) ──────────────────
  const { refreshEntries, refreshTimeline, refreshChapters } = useLoreKeeper();

  const {
    messages,
    setMessages,
    sendMessage,
    retryCloudSync,
    retryAssistantResponse,
    copyOriginalMessage,
    dismissDeliveryNotice,
    retryingKeys,
    isLoading,
    loadingStage,
    loadingProgress,
    streamingMessageId,
    sources,
    clearConversation,
    messageRefs,
    registerMessageRef,
    GroupToastContainer,
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
    isHydratingMessages,
    hydrationError,
    retryHydrateActiveThread,
  } = useConversationRuntime();

  // Build the display list: prepend the ephemeral greeting when present.
  // greetingMessage is never persisted — it lives only in runtime state.
  const greetingDisplayMsg = useMemo(
    () =>
      greetingMessage
        ? {
            id: `greeting-${activeThreadId}`,
            role: 'assistant' as const,
            content: greetingMessage,
            timestamp: new Date(),
            metadata: { intent: 'return_greeting' },
          }
        : null,
    [greetingMessage, activeThreadId],
  );

  const displayMessages = useMemo(
    () => (greetingDisplayMsg ? [greetingDisplayMsg, ...messages] : messages),
    [greetingDisplayMsg, messages],
  );

  // Prefer explicit hydration state — the old messageCount heuristic could spin
  // forever after a failed/empty hydrate while list metadata still said > 0.
  const showThreadHydrating =
    isHydratingMessages || (threadsLoading && !!activeThreadId && messages.length === 0);

  const threadEntities = useMemo(() => collectThreadEntities(messages), [messages]);
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);

  useEffect(() => {
    setFocusedEntityId(null);
  }, [activeThreadId]);

  // Message-independent base: entityContext/composerEntities derived from
  // the pinned focus chip regardless of what's being sent. Used as-is for
  // display/diagnostic purposes (e.g. the admin export below), where
  // showing the raw current pin state is correct.
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

  // Per-message variant: a stale focus chip (left open from an earlier,
  // unrelated conversation) must not attach its entityContext to an
  // outgoing closed-scope message (e.g. "who's new and returning in this
  // story?"). An explicitly clicked-in-thread entity (`focused`) is always
  // an intentional pin for THIS message, so it's never gated. The chip
  // itself and chatFocus state are untouched — this only decides what
  // rides along with this specific outgoing message.
  const buildChatSendOptions = useCallback(
    (msg: string) => {
      const focused = focusedEntityId
        ? threadEntities.find((e) => e.id === focusedEntityId)
        : undefined;
      if (focused) return chatSendOptions;

      const { closedScope } = isClosedScopeQuery(msg);
      const focusRelevant = !chatFocus || !closedScope || isFocusEntityRelevant(msg, chatFocus.entityName ?? '');
      if (focusRelevant) return chatSendOptions;

      return { ...chatSendOptions, entityContext: undefined, composerEntities: undefined };
    },
    [chatSendOptions, chatFocus, focusedEntityId, threadEntities]
  );

  // Wrap sendMessage: clear the greeting and track analytics before sending.
  const handleSubmit = (
    msg: string,
    certifiedEntities?: CertifiedEntityMatch[],
    previewCorrections?: import('../../../lib/entityCorrectionTypes').CorrectedPreviewSpan[],
    images?: import('../types/chatImageAttachment').ChatImageAttachment[],
  ) => {
    if (greetingMessage) {
      analytics.track('greeting_responded', {
        threadId: activeThreadId,
        greetingLength: greetingMessage.length,
      });
      clearGreeting();
    }
    const options = buildChatSendOptions(msg);
    sendMessage(msg, {
      ...options,
      composerEntities: certifiedEntities?.length ? certifiedEntities : options.composerEntities,
      previewCorrections,
      ...(images?.length ? { images } : {}),
    });
  };

  const handleRecallPrompt = useCallback(
    (prompt: string) => {
      sendMessage(prompt, buildChatSendOptions(prompt));
    },
    [sendMessage, buildChatSendOptions]
  );

  const chatSimulation = useChatLifecycleSimulation({
    sendMessage: useCallback(
      async (text: string) => {
        sendMessage(text, buildChatSendOptions(text));
      },
      [sendMessage, buildChatSendOptions]
    ),
  });

  const autoSimRanRef = useRef(false);
  useEffect(() => {
    if (!chatSimulation.enabled || autoSimRanRef.current) return;
    const scenarioId = searchParams.get('chatSim');
    if (!scenarioId) return;
    autoSimRanRef.current = true;
    void chatSimulation.runScenario(scenarioId);
  }, [chatSimulation, searchParams]);

  // Track greeting_shown when the greeting first appears.
  // greeting_responded is tracked inside handleSubmit above.
  useEffect(() => {
    if (!greetingMessage || !activeThreadId) return;
    analytics.track('greeting_shown', { threadId: activeThreadId });
  }, [greetingMessage, activeThreadId]);

  const { isGuest, canSendChatMessage } = useGuest();
  const { backendUnavailable } = useMockData();
  const demoRuntime = isDemoRuntimeActive();
  // Public /demo must never show the authenticated account avatar / initials.
  const avatarUrl: string | undefined = demoRuntime
    ? undefined
    : user?.user_metadata?.avatar_url;
  const avatarInitial: string | null = (() => {
    if (demoRuntime) return 'D';
    const name: string = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || '';
    return name ? name.charAt(0).toUpperCase() : null;
  })();

  const [selectedSource, setSelectedSource] = useState<ChatSource | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMessageId, setSearchMessageId] = useState<string | null>(null);
  const [jumpHighlightTerms, setJumpHighlightTerms] = useState<string[]>([]);
  /** Shown after jumping into a long reused thread — offer a clean draft. */
  const [longThreadJumpOffer, setLongThreadJumpOffer] = useState(false);

  // Jump to a message when navigating from character "From your chats" / thread search.
  // Keep the pending jump until the target message is present (don't clear on a miss).
  useEffect(() => {
    if (!activeThreadId) return;
    const jumpId = peekChatJumpMessageId();
    if (!jumpId) return;

    const jumpSession = peekChatJumpSessionId();
    if (jumpSession && jumpSession !== activeThreadId) return;

    if (messages.length === 0) return;

    const finishJump = (messageId: string) => {
      setSearchMessageId(messageId);
      setJumpHighlightTerms(peekChatJumpHighlightTerms());
      clearChatThreadJump();
      // Long sticky sessions feel "merged" when a mention opens them — offer escape.
      const metaCount = threads.find((t) => t.id === activeThreadId)?.messageCount ?? 0;
      if (Math.max(messages.length, metaCount) >= 25) {
        setLongThreadJumpOffer(true);
      }
    };

    if (messages.some((m) => m.id === jumpId)) {
      finishJump(jumpId);
      return;
    }

    const jumpIndexRaw = sessionStorage.getItem('lk:chat-jump-index');
    if (jumpIndexRaw != null) {
      sessionStorage.removeItem('lk:chat-jump-index');
      const idx = Number(jumpIndexRaw);
      const target = messages[idx];
      if (target?.id) {
        finishJump(target.id);
      }
    }
  }, [activeThreadId, messages, threads]);

  // Fade name highlight after a few seconds; keep message ring via searchMessageId until next nav.
  useEffect(() => {
    if (!jumpHighlightTerms.length || !searchMessageId) return;
    const t = window.setTimeout(() => setJumpHighlightTerms([]), 8000);
    return () => window.clearTimeout(t);
  }, [jumpHighlightTerms, searchMessageId]);

  // Clear the jumped-message ring after the user has had time to spot it.
  useEffect(() => {
    if (!searchMessageId) return;
    const t = window.setTimeout(() => setSearchMessageId(null), 12000);
    return () => window.clearTimeout(t);
  }, [searchMessageId]);
  const [showWorkSummary, setShowWorkSummary] = useState(false);
  const [correcting, setCorrecting] = useState<{ id: string; content: string } | null>(null);
  const { correctMessage, saving: correctionSaving, error: correctionError } = useMessageCorrection();
  const [showCognitiveTrace] = useLocalStorage<boolean>('lorekeeper_cognitive_trace', false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [initialImages, setInitialImages] = useState<
    import('../types/chatImageAttachment').ChatImageAttachment[] | null
  >(null);
  const [autoSubmitHandoff, setAutoSubmitHandoff] = useState(false);
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

  // Apply modal → chat prefill once per focus arrival.
  // Empty / scrubbed handoffs (Groups) clear the composer so the retired
  // Maya correction boilerplate cannot stick around in a saved draft.
  // Entity focus (Characters / Love / etc.) starts a fresh draft by default so
  // we never dump a new topic into a long sticky mega-thread.
  useEffect(() => {
    if (!chatFocus?.arrivedAt) {
      if (chatFocus?.initialPrompt) {
        setInitialPrompt(scrubLegacyComposerPrefill(chatFocus.initialPrompt));
      }
      return;
    }
    if (lastFocusArrivalRef.current === chatFocus.arrivedAt) return;
    lastFocusArrivalRef.current = chatFocus.arrivedAt;

    if (chatFocus.startNewThread !== false) {
      handleNewChatBase();
    }

    const scrubbed = scrubLegacyComposerPrefill(chatFocus.initialPrompt ?? '');
    if (scrubbed) {
      setInitialPrompt(scrubbed);
    } else {
      const ownerId = isDemoRuntimeActive()
        ? demoThreadStorageUserId()
        : (user?.id ?? 'guest-or-anonymous');
      clearComposerDraft(ownerId, activeThreadId);
      dispatch(setComposerDraft(''));
      setInitialPrompt('');
    }

    const postEventHandoff = takePostEventChatHandoff();
    if (postEventHandoff?.images?.length) {
      setInitialImages(postEventHandoff.images);
    } else {
      setInitialImages(null);
    }
    setAutoSubmitHandoff(Boolean(chatFocus.autoSubmit || postEventHandoff?.autoSubmit));

    setFocusComposerPulse(true);
    const timer = window.setTimeout(() => setFocusComposerPulse(false), 2600);
    return () => window.clearTimeout(timer);
  }, [
    chatFocus?.arrivedAt,
    chatFocus?.entityId,
    chatFocus?.sourceSurface,
    chatFocus?.initialPrompt,
    chatFocus?.autoSubmit,
    chatFocus?.startNewThread,
    activeThreadId,
    dispatch,
    user?.id,
    handleNewChatBase,
  ]);

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
    setLongThreadJumpOffer(false);
    handleNewChatBase();
  };

  const handleSelectThreadWrapped = useCallback(
    async (id: string) => {
      setLongThreadJumpOffer(false);
      await handleSelectThread(id);
    },
    [handleSelectThread],
  );

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

  const handleForkMessage = useCallback((messageId: string) => {
    forkThread(messageId);
  }, [forkThread]);

  const handleRetryCloudSync = useCallback((id: string) => {
    void retryCloudSync(id);
  }, [retryCloudSync]);

  const handleRetryAssistantResponse = useCallback((id: string) => {
    void retryAssistantResponse(id);
  }, [retryAssistantResponse]);

  const handleCopyOriginalMessage = useCallback((id: string) => {
    void copyOriginalMessage(id);
  }, [copyOriginalMessage]);

  const handleRegenerate = async (messageId: string) => {
    analytics.track('chat_message_regenerated', { messageId });
    // Reuse the same clientIdempotencyKey — never append another user message.
    await retryAssistantResponse(messageId);
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

  // Roster chip → thread list filtered to that cast member's threads.
  const [castFilter, setCastFilter] = useState<{
    entityId: string;
    name: string;
    threadIds: Set<string>;
  } | null>(null);
  const handleFilterByEntity = useCallback(async (entityId: string, name: string) => {
    try {
      const result = await fetchCastThreads(entityId);
      setCastFilter({ entityId, name, threadIds: new Set(result.threads.map((t) => t.id)) });
    } catch {
      setCastFilter(null);
    }
  }, []);

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
  const [conversationCopying, setConversationCopying] = useState(false);
  const handleCopyConversation = async () => {
    if (messages.length === 0) return;
    setConversationCopying(true);
    const liveChips = composerChipDebugRef.current;
    // Read the live composer state fresh here rather than subscribing at
    // render time — this handler fires on a manual click, not per keystroke.
    const composerState = store.getState().composer;
    const buildingOn = threadEntities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
    }));
    const recentMentions = collectRecentThreadMentions(messages, {
      recentMessageWindow: 12,
      max: 12,
    });
    const composerAndContext = buildComposerAndContextDebugSnapshot({
      chatFocus,
      composerDraft: composerState.draftText,
      composerEntityChips: liveChips?.certifiedEntities ?? selectVisibleComposerMatches(store.getState()),
      confirmingSlots: liveChips?.confirmingSlots ?? composerState.confirmingSlots,
      includedSlots: liveChips?.includedSlots ?? composerState.includedSlots,
      lexicalPreviewChips: liveChips?.previewSpans ?? [],
      threadChips: buildingOn,
      selectedThreadChipId: focusedEntityId,
      entityContext: chatSendOptions.entityContext ?? null,
      composerEntitiesFromFocus: chatSendOptions.composerEntities,
    });

    let threadSurface: ThreadSurfaceDebugSnapshot = {
      buildingOn,
      recentMentions: recentMentions.map((m) => ({
        id: m.id,
        name: m.name,
        lifecycleStatus: m.lifecycleStatus,
        identityStage: m.identityStage,
        identityConfidence: m.identityConfidence,
      })),
      people: [],
      places: [],
      themes: [],
      actors: [],
    };

    if (user?.id && activeThreadId) {
      const [summaryResult, rosterResult] = await Promise.allSettled([
        fetchThreadSummary(activeThreadId),
        fetchThreadRoster(activeThreadId),
      ]);
      if (summaryResult.status === 'fulfilled') {
        const summary = summaryResult.value.summary;
        const people = scrubPeopleLabels([
          ...(summary.people ?? []),
          ...threadEntities.filter((entity) => entity.type === 'character').map((entity) => entity.name),
        ]);
        const places = scrubPlacesLabels([
          ...(summary.places ?? []),
          ...threadEntities.filter((entity) => entity.type === 'location').map((entity) => entity.name),
        ]);
        threadSurface = {
          ...threadSurface,
          people,
          places,
          themes: (summary.themes ?? []).map((t) => t.trim()).filter(Boolean),
          summaryLine:
            scrubSummaryDisplayLine(summary.medium || summary.short || summary.long, people, places) ??
            null,
        };
      }
      if (rosterResult.status === 'fulfilled') {
        threadSurface = {
          ...threadSurface,
          actors: (rosterResult.value.entries ?? [])
            .filter((e) => isCastDisplayWorthy(e.name, e.kind))
            .map((e) => ({
              name: e.name,
              kind: e.kind,
              role: e.role,
              status: e.status,
              mentions: e.mentions,
              entityId: e.entityId,
              actorType: e.actorType,
            })),
        };
      }
    }

    try {
      const adminDiagnostics = canCopyAdminDiagnostics
        ? {
            threadId: activeThreadId,
            byMessageId: await loadAdminMessageDiagnostics(messages),
            runtimeEvents: runtimeDiagnostics
              .tail(100)
              .filter((event) => !activeThreadId || !event.threadId || event.threadId === activeThreadId),
            composerAndContext,
            threadSurface,
          }
        : undefined;
      const text = buildChatConversationCopyText(
        messages,
        adminDiagnostics,
        composerAndContext,
        threadSurface,
      );
      await navigator.clipboard.writeText(text);
      setConversationCopied(true);
      setTimeout(() => setConversationCopied(false), 2000);
    } catch {
      // Preserve the original useful behavior if one diagnostic lookup or the
      // richer export fails for any reason.
      const fallback = buildChatConversationCopyText(
        messages,
        undefined,
        composerAndContext,
        threadSurface,
      );
      await navigator.clipboard.writeText(fallback);
      setConversationCopied(true);
      setTimeout(() => setConversationCopied(false), 2000);
    } finally {
      setConversationCopying(false);
    }
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] lg:h-full bg-black w-full overflow-hidden">
      <GroupToastContainer />
      <ChatThreadList
        threads={threads}
        currentThreadId={activeThreadId}
        onNewChat={handleNewChat}
        onSelectThread={(id, options) => {
          if (options?.messageId) {
            sessionStorage.setItem(CHAT_JUMP_MESSAGE_KEY, options.messageId);
          } else if (options?.messageIndex != null) {
            sessionStorage.setItem('lk:chat-jump-index', String(options.messageIndex));
          }
          setThreadListMobileOpen(false);
          void handleSelectThreadWrapped(id);
        }}
        onDeleteThread={handleDeleteThread}
        onRenameThread={renameThread}
        collapsed={threadListCollapsed}
        onToggleCollapsed={() => setThreadListCollapsed((c) => !c)}
        mobileOpen={threadListMobileOpen}
        onMobileClose={() => setThreadListMobileOpen(false)}
        isMobile={isMobile}
        castFilter={castFilter}
        onClearCastFilter={() => setCastFilter(null)}
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
                onClick={() => void handleCopyConversation()}
                disabled={conversationCopying}
                className={`h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors touch-manipulation disabled:cursor-wait ${conversationCopied ? 'text-green-400' : 'text-white/40 hover:text-white/70'} ${conversationCopying ? 'animate-pulse' : ''}`}
                title={
                  conversationCopied
                    ? 'Copied!'
                    : canCopyAdminDiagnostics
                      ? 'Copy conversation + thread surface + admin diagnostic receipt'
                      : 'Copy conversation + people, places, actors, and chips'
                }
                aria-label={
                  canCopyAdminDiagnostics
                    ? 'Copy conversation, thread surface, and admin diagnostics'
                    : 'Copy conversation and thread surface'
                }
                data-testid="copy-conversation"
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

        <AiBudgetBanner budget={subscription?.openAiBudget} usage={subscription?.usage} />

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

        {longThreadJumpOffer && (
          <div
            className="mx-3 sm:mx-4 mb-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
            data-testid="long-thread-jump-offer"
            role="status"
          >
            <p className="text-xs sm:text-sm text-amber-50/90 flex-1 min-w-0">
              This thread has piled up many older conversations. Stay to read the source line, or start a fresh chat so new messages stay clean.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleNewChat}
                className="px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-50 text-xs font-medium"
              >
                Start fresh chat
              </button>
              <button
                type="button"
                onClick={() => setLongThreadJumpOffer(false)}
                className="px-3 py-1.5 rounded-lg text-amber-100/70 hover:text-amber-50 text-xs"
              >
                Stay here
              </button>
            </div>
          </div>
        )}

        <ThreadSummaryBar
          threadId={activeThreadId}
          messageCount={messages.length}
          isMobile={isMobile}
          onRecallInChat={user ? handleRecallPrompt : undefined}
          confirmedEntities={threadEntities}
        />

        {/* Actors — resolved identities only; recent mentions stay evidence */}
        {user && (
          <ThreadRosterBar
            threadId={activeThreadId}
            messageCount={messages.length}
            threadTitle={threads.find((t) => t.id === activeThreadId)?.title}
            onFilterByEntity={handleFilterByEntity}
            recentMentions={collectRecentThreadMentions(messages, {
              recentMessageWindow: 12,
              max: 6,
            })}
          />
        )}

        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 overflow-y-auto chat-scrollbar">
              {showThreadHydrating ? (
                <div className="flex flex-1 items-center justify-center min-h-[12rem] p-6">
                  <ChatLoadingPulse stage="connecting" progress={35} />
                </div>
              ) : hydrationError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 min-h-[12rem] p-6 text-center">
                  <p className="text-sm text-white/70">Couldn&apos;t load this conversation.</p>
                  <p className="text-xs text-white/40 max-w-sm">{hydrationError}</p>
                  <button
                    type="button"
                    onClick={() => retryHydrateActiveThread()}
                    className="rounded-lg bg-primary/20 px-3 py-1.5 text-sm text-primary hover:bg-primary/30"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <ChatEmptyState />
                  {user && <CastTrendsNudge onPrefillComposer={prefillComposer} />}
                </>
              )}
            </div>
          ) : (
            <ChatMessageList
              messages={displayMessages}
              streamingMessageId={streamingMessageId}
              searchMessageId={searchMessageId}
              highlightTerms={
                searchMessageId && jumpHighlightTerms.length > 0 ? jumpHighlightTerms : undefined
              }
              messageRefs={messageRefs.current}
              showCognitiveTrace={showCognitiveTrace}
              onCopy={handleCopy}
              onRegenerate={handleRegenerate}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onFork={handleForkMessage}
              onSourceClick={handleSourceClick}
              onFeedback={handleFeedback}
              onSuggestedAction={handleSuggestedAction}
              onPrefillComposer={prefillComposer}
              registerMessageRef={registerMessageRef}
              onRetryCloudSync={handleRetryCloudSync}
              onRetryAssistantResponse={handleRetryAssistantResponse}
              onCopyOriginalMessage={handleCopyOriginalMessage}
              onDismissDeliveryNotice={dismissDeliveryNotice}
              retryingKeys={retryingKeys}
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

        {composerDraftIsEmpty && (
          <ThreadEntityChips
            messages={messages}
            variant="composer"
            selectedEntityId={focusedEntityId}
            onSelectEntity={(entity) => setFocusedEntityId(entity?.id ?? null)}
          />
        )}

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
          <ReturnPointBanner
            threadId={activeThreadId ?? undefined}
            onContinue={(ctx: ContinueContext, surfaceLine: string) => {
              // Prefill a natural continue prompt; structured context rides in the message for the model.
              const prompt = `${surfaceLine}\n\n[return_point:${ctx.returnPointId} mode=${ctx.recommendedContinuityMode} state=${ctx.unresolvedState}]`;
              setInitialPrompt(prompt);
            }}
          />
          <ChatComposer
            onSubmit={handleSubmit}
            loading={isLoading}
            disabled={isGuest && !canSendChatMessage()}
            initialPrompt={initialPrompt}
            onInitialPromptApplied={() => setInitialPrompt(null)}
            initialImages={initialImages}
            autoSubmit={autoSubmitHandoff}
            onAutoSubmitDone={() => {
              setAutoSubmitHandoff(false);
              setInitialImages(null);
            }}
            initialDate={initialDate}
            threadId={activeThreadId ?? undefined}
            defaultCollapsed={isMobile && messages.length > 0}
            focusCharacterId={chatFocus?.entityType === 'character' ? chatFocus.entityId : undefined}
            focusCharacterName={chatFocus?.entityType === 'character' ? chatFocus.entityName : undefined}
            onChipDebugChange={handleComposerChipDebugChange}
            onUploadComplete={async (result?: UploadCompletePayload) => {
              const now = new Date();
              if (result?.kind === 'resume') {
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
                    content: result.chatFeedback ?? 'Resume processed.',
                    timestamp: now,
                    isSystemMessage: true,
                  },
                ]);
                dispatchStoryDataUpdated({ scopes: ['all'], delayMs: 1500 });
              } else if (result?.kind === 'photo') {
                const img = result.chatImage;

                // Discuss: real multimodal chat turn so the model sees the image.
                if (result.discussOnly && img?.dataUrl) {
                  const prompt =
                    result.analysis?.summary
                      ? `I just shared this photo (${result.fileName}). Analysis: "${result.analysis.summary}". Talk with me about it — what should we remember?`
                      : `I just shared this photo (${result.fileName}). What do you notice? Help me remember what matters.`;
                  void sendMessage(prompt, {
                    ...buildChatSendOptions(prompt),
                    images: [
                      {
                        dataUrl: img.dataUrl,
                        mimeType: img.mimeType,
                        detail: 'high',
                        url: img.url,
                      },
                    ],
                  });
                } else {
                  // Saved to lore: show confirmation bubbles with thumbnail.
                  const userBubble: Message = {
                    id: `upload-photo-user-${now.getTime()}`,
                    role: 'user',
                    content: `📷 Saved photo: ${result.fileName}`,
                    timestamp: now,
                    persistStatus: 'saved',
                    ...(img || result.processResult?.photoUrl
                      ? {
                          attachments: [
                            {
                              kind: 'image' as const,
                              dataUrl: img?.dataUrl,
                              url: img?.url ?? result.processResult?.photoUrl,
                              mimeType: img?.mimeType ?? 'image/jpeg',
                            },
                          ],
                        }
                      : {}),
                  };
                  const assistantLines = [
                    result.chatFeedback,
                    result.addedToLoreBook
                      ? 'It’s in your photo album and memories.'
                      : '',
                    result.processResult?.selfMediaId || result.analysis?.isSelfie
                      ? 'Also on your main character Photos tab (selfies / photos of you).'
                      : '',
                    'You can keep typing below — ask follow-ups anytime.',
                  ]
                    .filter(Boolean)
                    .join('\n\n');

                  setMessages([
                    ...messages,
                    userBubble,
                    {
                      id: `upload-photo-assistant-${now.getTime()}`,
                      role: 'assistant',
                      content: assistantLines || 'Photo processed.',
                      timestamp: now,
                      isSystemMessage: true,
                    },
                  ]);
                }

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

      {chatSimulation.enabled && (
        <ChatSimulationPanel
          scenarios={chatSimulation.scenarios}
          runState={chatSimulation.runState}
          onRun={chatSimulation.runScenario}
          onStop={chatSimulation.stopScenario}
        />
      )}
    </div>
  );
};
