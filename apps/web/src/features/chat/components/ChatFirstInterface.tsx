import { useState, useEffect, useRef } from 'react';
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
import { Search as SearchIcon, MessageSquareText, Brain } from 'lucide-react';
import { useLocalStorage } from '../../../hooks/useLocalStorage';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessageList } from '../message/ChatMessageList';
import { ChatLoadingPulse } from './ChatLoadingPulse';
import { ChatComposer } from '../composer/ChatComposer';
import { ChatSourcesBar } from '../sources/ChatSourcesBar';
import { ChatSourceNavigator } from '../sources/ChatSourceNavigator';
import { ChatSearchModal } from '../search/ChatSearchModal';
import { ChatThreadList } from './ChatThreadList';
import { GuestSignUpPrompt } from '../../../components/guest/GuestSignUpPrompt';
import { CurrentContextBreadcrumbs } from '../../../components/CurrentContextBreadcrumbs';
import { useGuest } from '../../../contexts/GuestContext';
import { WorkSummaryImporter } from '../../../components/work/WorkSummaryImporter';
import { diagnoseEndpoints, logDiagnostics } from '../../../utils/errorDiagnostics';
import { analytics } from '../../../lib/monitoring';
import { fetchJson } from '../../../lib/api';
import { useLoreKeeper } from '../../../hooks/useLoreKeeper';
import { ThreadSaveChip } from './ThreadSaveChip';
import type { ChatSource } from '../message/ChatMessage';
import '../styles/chat-theme.css';
import '../styles/message-animations.css';

export const ChatFirstInterface = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
  } = useConversationRuntime({
    messages,
    setMessages,
    clearMessages: clearConversation,
  });

  const { isGuest, canSendChatMessage } = useGuest();

  const [selectedSource, setSelectedSource] = useState<ChatSource | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMessageId, setSearchMessageId] = useState<string | null>(null);
  const [showWorkSummary, setShowWorkSummary] = useState(false);
  const [showCognitiveTrace, setShowCognitiveTrace] = useLocalStorage<boolean>('lorekeeper_cognitive_trace', false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [initialDate, setInitialDate] = useState<string | null>(null);
  const [threadListCollapsed, setThreadListCollapsed] = useState(false);
  const [threadListMobileOpen, setThreadListMobileOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'ok' | 'degraded' | 'unreachable' | null>(null);
  const [statusDismissed, setStatusDismissed] = useState(false);
  const isMobile = useIsMobile(640);

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = threadListMobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, threadListMobileOpen]);

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

  // ── Health check (once per session) ──────────────────────────────────────────
  const healthWarnedRef = useRef(false);
  useEffect(() => {
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
  }, []);

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
    if (!confirm('Delete this chat?')) return;
    handleDeleteThreadBase(id);
  };

  const handleClearConversation = () => {
    if (confirm('Start a new chat? Current messages will be saved in this thread.')) {
      handleNewChat();
    }
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
      location: '/locations', task: '/timeline', hqi: '/search', fabric: '/discovery',
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
      setTimeout(() => { sendMessage(userMessage.content); }, 100);
    }
  };

  const handleEdit = (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (message && message.role === 'user') {
      analytics.track('chat_message_edited', { messageId });
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

  return (
    <div className="flex h-screen lg:h-full bg-black w-full overflow-hidden">
      <ChatThreadList
        threads={threads}
        currentThreadId={activeThreadId}
        onNewChat={handleNewChat}
        onSelectThread={(id) => {
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
      />

      <div className="flex flex-col flex-1 min-w-0 relative chat-container overflow-hidden">
        {/* Header */}
        <div className="border-b border-white/10 bg-black/40 backdrop-blur-sm px-3 sm:px-4 py-3 sm:py-2 flex items-center justify-between flex-shrink-0 gap-2" style={{ paddingTop: 'env(safe-area-inset-top, 0.75rem)' }}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h2 className="text-xs sm:text-sm font-semibold text-white/90 flex-shrink-0">Lore Book</h2>
            <CurrentContextBreadcrumbs />
            <ThreadSaveChip threadId={activeThreadId} />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowCognitiveTrace(!showCognitiveTrace)}
              className={`h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors touch-manipulation ${showCognitiveTrace ? 'text-primary' : 'text-white/40 hover:text-white/60'}`}
              title={showCognitiveTrace ? 'Hide cognitive trace' : 'Show cognitive trace'}
            >
              <Brain className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="text-white/60 hover:text-white h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors touch-manipulation"
              title="Search conversation (⌘K)"
            >
              <SearchIcon className="h-4 w-4 sm:h-4 sm:w-4" />
            </button>
            {isMobile && (
              <button
                type="button"
                onClick={() => setThreadListMobileOpen(true)}
                className="text-white/60 hover:text-white h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors touch-manipulation"
                aria-label="Chat history"
              >
                <MessageSquareText className="h-5 w-5" />
              </button>
            )}
            {messages.length > 0 && (
              <button
                onClick={handleClearConversation}
                className="text-xs text-white/40 hover:text-white/60 transition-colors px-1.5 sm:px-2"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Runtime status banner */}
        {backendStatus && !statusDismissed && (
          <div className={`flex items-center justify-between px-3 py-2 text-xs flex-shrink-0 ${
            backendStatus === 'unreachable'
              ? 'bg-red-900/40 border-b border-red-500/30 text-red-300'
              : 'bg-yellow-900/30 border-b border-yellow-500/20 text-yellow-300'
          }`}>
            <span>
              {backendStatus === 'unreachable'
                ? 'Cannot reach server — running in offline mode. Messages will not be saved.'
                : 'Server is degraded — some features may not work correctly.'}
            </span>
            <button
              type="button"
              onClick={() => setStatusDismissed(true)}
              className="ml-3 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Search Modal */}
        {showSearch && (
          <ChatSearchModal
            messages={messages}
            isOpen={showSearch}
            onResultClick={handleSearchResultClick}
            onClose={() => setShowSearch(false)}
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

        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 overflow-y-auto chat-scrollbar">
              <ChatEmptyState />
            </div>
          ) : (
            <ChatMessageList
              messages={messages}
              streamingMessageId={streamingMessageId}
              searchMessageId={searchMessageId}
              messageRefs={messageRefs.current}
              showCognitiveTrace={showCognitiveTrace}
              onCopy={handleCopy}
              onRegenerate={handleRegenerate}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSourceClick={handleSourceClick}
              onFeedback={handleFeedback}
              registerMessageRef={registerMessageRef}
            />
          )}

          {isLoading && !streamingMessageId && (
            <div className="px-4 flex-shrink-0">
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

        {/* Composer */}
        <div className="flex-shrink-0">
          <ChatComposer
            onSubmit={sendMessage}
            loading={isLoading}
            disabled={isGuest && !canSendChatMessage()}
            initialPrompt={initialPrompt}
            initialDate={initialDate}
            onUploadComplete={async () => {
              await Promise.all([refreshEntries(), refreshTimeline(), refreshChapters()]);
            }}
          />
        </div>
      </div>
    </div>
  );
};
