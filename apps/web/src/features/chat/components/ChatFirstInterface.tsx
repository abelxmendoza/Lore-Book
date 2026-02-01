import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';

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
import { useConversationStore } from '../hooks/useConversationStore';
import { useChatThreads } from '../hooks/useChatThreads';
import { Search as SearchIcon, MessageSquareText } from 'lucide-react';
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
import { exportConversationAsMarkdown, exportConversationAsJSON, downloadFile } from '../../../utils/exportConversation';
import { diagnoseEndpoints, logDiagnostics } from '../../../utils/errorDiagnostics';
import { analytics } from '../../../lib/monitoring';
import { fetchJson } from '../../../lib/api';
import { useLoreKeeper } from '../../../hooks/useLoreKeeper';
import { useAuth } from '../../../lib/supabase';
import type { ChatSource } from '../message/ChatMessage';
import '../styles/chat-theme.css';
import '../styles/message-animations.css';

export const ChatFirstInterface = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { threadId: threadIdParam } = useParams<{ threadId?: string }>();
  const conversationStore = useConversationStore();
  const { messageRefs, registerMessageRef, setMessages } = conversationStore;
  const { refreshEntries, refreshTimeline, refreshChapters } = useLoreKeeper();
  const {
    threads,
    currentThreadId,
    setCurrentThreadId,
    createThread,
    getThread,
    switchThread,
    updateThread,
    deleteThread: deleteThreadAction,
  } = useChatThreads();

  const {
    messages,
    sendMessage,
    isLoading,
    loadingStage,
    loadingProgress,
    streamingMessageId,
    sources,
    messagesEndRef,
    clearConversation,
    scrollToBottom,
  } = useChat();
  const { user, loading: authLoading } = useAuth();
  const { isGuest, canSendChatMessage } = useGuest();

  const [selectedSource, setSelectedSource] = useState<ChatSource | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMessageId, setSearchMessageId] = useState<string | null>(null);
  const [showWorkSummary, setShowWorkSummary] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [initialDate, setInitialDate] = useState<string | null>(null);
  const [threadListCollapsed, setThreadListCollapsed] = useState(false);
  const [threadListMobileOpen, setThreadListMobileOpen] = useState(false);
  const isMobile = useIsMobile(640);
  const pendingNewThreadRef = useRef(false);
  const skipNextSyncRef = useRef(false);

  useEffect(() => {
    if (!isMobile) return;
    if (threadListMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, threadListMobileOpen]);

  // Load thread when threadId in URL changes
  useEffect(() => {
    if (authLoading) return;
    if (threadIdParam) {
      const thread = getThread(threadIdParam);
      if (thread) {
        setMessages(thread.messages);
        switchThread(threadIdParam);
        skipNextSyncRef.current = true;
      } else {
        navigate('/chat', { replace: true });
      }
    } else {
      setMessages([]);
      setCurrentThreadId(null);
    }
  }, [authLoading, threadIdParam, getThread, setMessages, switchThread, setCurrentThreadId, navigate]);

  // When on "new chat" (/chat) and user sends first message, create thread and navigate
  useEffect(() => {
    if (!threadIdParam && messages.length > 0 && !pendingNewThreadRef.current) {
      pendingNewThreadRef.current = true;
      const id = createThread();
      const firstUser = messages.find((m) => m.role === 'user');
      const title = firstUser ? firstUser.content.slice(0, 50).trim() || 'New chat' : 'New chat';
      updateThread(id, { messages, title, updatedAt: new Date().toISOString() });
      navigate(`/chat/${id}`, { replace: true });
    }
    if (threadIdParam) pendingNewThreadRef.current = false;
  }, [threadIdParam, messages.length, messages, createThread, updateThread, navigate]);

  // Sync current thread with messages when they change (skip once after loading a thread)
  useEffect(() => {
    if (!threadIdParam) return;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    updateThread(threadIdParam, { messages, updatedAt: new Date().toISOString() });
  }, [threadIdParam, messages, updateThread]);

  // Read URL params for pre-filling (date and prompt)
  useEffect(() => {
    const dateParam = searchParams.get('date');
    const promptParam = searchParams.get('prompt');
    
    if (dateParam) {
      setInitialDate(dateParam);
    }
    
    if (promptParam) {
      const decodedPrompt = decodeURIComponent(promptParam);
      setInitialPrompt(decodedPrompt);
      // Clear the URL params after reading
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('date');
      newSearchParams.delete('prompt');
      navigate({ search: newSearchParams.toString() }, { replace: true });
    }
  }, [searchParams, navigate]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: () => setShowSearch(!showSearch),
    onCommands: () => {
      const textarea = document.querySelector('textarea[placeholder*="Message Lore Book"]') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.value = '/';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    onDiagnostics: () => {
      diagnoseEndpoints('/api').then(logDiagnostics);
    },
    onEscape: () => {
      if (showSearch) setShowSearch(false);
      if (selectedSource) setSelectedSource(null);
    }
  });

  // Auto-diagnose on mount (log at most once per session to avoid console noise)
  const healthWarnedRef = useRef(false);
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok && !healthWarnedRef.current) {
          healthWarnedRef.current = true;
          if (response.status === 503) {
            const body = await response.json().catch(() => ({}));
            if (body.error === 'Database schema incomplete' || Array.isArray(body.missingTables)) {
              console.warn('⚠️ Database schema incomplete. Run: ./scripts/run-base-migrations.sh');
              return;
            }
          }
          console.warn('⚠️ Health check failed. Run diagnostics with Cmd+Shift+D');
        }
      } catch (_err) {
        if (!healthWarnedRef.current) {
          healthWarnedRef.current = true;
          console.warn('⚠️ Cannot reach server. Run diagnostics with Cmd+Shift+D');
        }
      }
    };
    checkHealth();
  }, []);

  const handleSourceClick = (source: ChatSource) => {
    setSelectedSource(source);
    analytics.track('chat_source_clicked', { sourceType: source.type, sourceId: source.id });
  };

  const handleNavigateToSource = (surface: 'timeline' | 'characters' | 'memoir' | 'lorebook', id?: string) => {
    setSelectedSource(null);
    
    const routeMap: Record<string, string> = {
      entry: '/timeline',
      chapter: '/timeline',
      character: '/characters',
      location: '/locations',
      task: '/timeline',
      hqi: '/search',
      fabric: '/discovery',
    };

    const route = routeMap[surface] || '/timeline';
    navigate(route);
    
    analytics.track('chat_source_navigated', { surface, id, route });
    
    if (id) {
      sessionStorage.setItem('highlightItem', id);
    }
  };

  const handleCopy = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      navigator.clipboard.writeText(message.content);
      analytics.track('chat_message_copied', { messageId, role: message.role });
    }
  };

  const handleRegenerate = async (messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const userMessage = messages[messageIndex - 1];
    if (!userMessage || userMessage.role !== 'user') return;

    analytics.track('chat_message_regenerated', { messageId });

    // Remove the old assistant message and any messages after it
    const index = messages.findIndex(m => m.id === messageId);
    if (index >= 0) {
      const updatedMessages = messages.slice(0, index);
      setMessages(updatedMessages);
      // Resend
      setTimeout(() => {
        sendMessage(userMessage.content);
      }, 100);
    }
  };

  const handleEdit = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.role === 'user') {
      analytics.track('chat_message_edited', { messageId });
      // Remove the message and any following messages
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex >= 0) {
        const updatedMessages = messages.slice(0, messageIndex);
        conversationStore.setMessages(updatedMessages);
        // Focus composer with the message content
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
    conversationStore.removeMessage(messageId);
  };

  const handleFeedback = async (messageId: string, feedback: 'positive' | 'negative') => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      analytics.track('chat_message_feedback', { messageId, feedback });
      
      try {
        const conversationContext = messages
          .slice(Math.max(0, messages.findIndex(m => m.id === messageId) - 3))
          .slice(0, 6)
          .map(msg => ({
            role: msg.role,
            content: msg.content
          }));

        await fetchJson('/api/chat/feedback', {
          method: 'POST',
          body: JSON.stringify({
            messageId,
            feedback,
            message: message.content,
            conversationContext
          })
        });
      } catch (error) {
        console.error('Failed to send feedback to backend:', error);
      }
    }
  };

  const handleExportMarkdown = () => {
    const markdown = exportConversationAsMarkdown(messages);
    const date = new Date().toISOString().split('T')[0];
    downloadFile(markdown, `lorebook-chat-${date}.md`, 'text/markdown');
  };

  const handleExportJSON = () => {
    const json = exportConversationAsJSON(messages);
    const date = new Date().toISOString().split('T')[0];
    downloadFile(json, `lorebook-chat-${date}.json`, 'application/json');
  };

  const handleNewChat = () => {
    setThreadListMobileOpen(false);
    const id = createThread();
    clearConversation();
    navigate(`/chat/${id}`);
  };

  const handleSelectThread = (id: string) => {
    setThreadListMobileOpen(false);
    switchThread(id);
    const thread = getThread(id);
    if (thread) setMessages(thread.messages);
    navigate(`/chat/${id}`);
  };

  const handleDeleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this chat?')) return;
    const nextThreads = threads.filter((t) => t.id !== id);
    const nextThread = nextThreads[0];
    deleteThreadAction(id);
    if (threadIdParam === id) {
      if (nextThread) {
        setMessages(nextThread.messages);
        navigate(`/chat/${nextThread.id}`);
      } else {
        setMessages([]);
        navigate('/chat');
      }
    }
  };

  const handleClearConversation = () => {
    if (confirm('Start a new chat? Current messages will be saved in this thread.')) {
      handleNewChat();
    }
  };

  const handleSearchResultClick = (messageId: string) => {
    setSearchMessageId(messageId);
    scrollToBottom();
    // Scroll to message will be handled by ChatMessageList
  };

  return (
    <div className="flex h-screen lg:h-full bg-black w-full overflow-hidden">
      <ChatThreadList
        threads={threads}
        currentThreadId={threadIdParam ?? currentThreadId}
        onNewChat={handleNewChat}
        onSelectThread={handleSelectThread}
        onDeleteThread={handleDeleteThread}
        collapsed={threadListCollapsed}
        onToggleCollapsed={() => setThreadListCollapsed((c) => !c)}
        mobileOpen={threadListMobileOpen}
        onMobileClose={() => setThreadListMobileOpen(false)}
        isMobile={isMobile}
      />
      <div className="flex flex-col flex-1 min-w-0 relative chat-container overflow-hidden">
      {/* Minimal header - ChatGPT style */}
      <div className="border-b border-white/10 bg-black/40 backdrop-blur-sm px-3 sm:px-4 py-3 sm:py-2 flex items-center justify-between flex-shrink-0 gap-2" style={{ paddingTop: 'env(safe-area-inset-top, 0.75rem)' }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h2 className="text-xs sm:text-sm font-semibold text-white/90 flex-shrink-0">Lore Book</h2>
          <CurrentContextBreadcrumbs />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
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
              title="Chat history"
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
            await Promise.all([
              refreshEntries(),
              refreshTimeline(),
              refreshChapters()
            ]);
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

      {/* Messages Area - flex-1 with min-h-0 to allow shrinking */}
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
            messageRefs={messageRefs}
            onCopy={handleCopy}
            onRegenerate={handleRegenerate}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSourceClick={handleSourceClick}
            onFeedback={handleFeedback}
            registerMessageRef={registerMessageRef}
          />
        )}

        {/* Loading Indicator */}
        {isLoading && !streamingMessageId && (
          <div className="px-4 flex-shrink-0">
            <ChatLoadingPulse stage={loadingStage} progress={loadingProgress} />
          </div>
        )}

        <div ref={messagesEndRef} className="flex-shrink-0" />

        {/* Sources Bar */}
        {messages.length > 0 && (
          <div className="flex-shrink-0">
            <ChatSourcesBar
              sources={sources}
              onSourceClick={handleSourceClick}
            />
          </div>
        )}

        {/* Guest Sign-Up Prompt */}
        {isGuest && !canSendChatMessage() && (
          <div className="px-4 pb-4 flex-shrink-0">
            <GuestSignUpPrompt />
          </div>
        )}
      </div>

      {/* Composer - flex-shrink-0 to prevent shrinking */}
      <div className="flex-shrink-0">
        <ChatComposer
          onSubmit={sendMessage}
          loading={isLoading}
          disabled={isGuest && !canSendChatMessage()}
          initialPrompt={initialPrompt}
          initialDate={initialDate}
          onUploadComplete={async () => {
            await Promise.all([
              refreshEntries(),
              refreshTimeline(),
              refreshChapters()
            ]);
          }}
        />
      </div>
      </div>
    </div>
  );
};

