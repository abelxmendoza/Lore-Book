import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../hooks/useChat';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useConversationStore } from '../hooks/useConversationStore';
import { Search as SearchIcon } from 'lucide-react';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessageList } from '../message/ChatMessageList';
import { ChatLoadingPulse } from './ChatLoadingPulse';
import { ChatComposer } from '../composer/ChatComposer';
import { ChatSourcesBar } from '../sources/ChatSourcesBar';
import { ChatSourceNavigator } from '../sources/ChatSourceNavigator';
import { ChatSearchModal } from '../search/ChatSearchModal';
import { GuestSignUpPrompt } from '../../../components/guest/GuestSignUpPrompt';
import { useGuest } from '../../../contexts/GuestContext';
import { WorkSummaryImporter } from '../../../components/work/WorkSummaryImporter';
import { exportConversationAsMarkdown, exportConversationAsJSON, downloadFile } from '../../../utils/exportConversation';
import { diagnoseEndpoints, logDiagnostics } from '../../../utils/errorDiagnostics';
import { analytics } from '../../../lib/monitoring';
import { fetchJson } from '../../../lib/api';
import { useLoreKeeper } from '../../../hooks/useLoreKeeper';
import type { ChatSource } from '../message/ChatMessage';
import '../styles/chat-theme.css';
import '../styles/message-animations.css';

export const ChatFirstInterface = () => {
  const navigate = useNavigate();
  const conversationStore = useConversationStore();
  const { messageRefs, registerMessageRef, loadConversation, setMessages } = conversationStore;
  const { refreshEntries, refreshTimeline, refreshChapters } = useLoreKeeper();
  
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
    scrollToBottom
  } = useChat();
  const { isGuest, canSendChatMessage } = useGuest();
  
  const [selectedSource, setSelectedSource] = useState<ChatSource | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMessageId, setSearchMessageId] = useState<string | null>(null);
  const [showWorkSummary, setShowWorkSummary] = useState(false);

  // Load conversation on mount
  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

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

  // Auto-diagnose on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) {
          console.warn('⚠️ Health check failed. Run diagnostics with Cmd+Shift+D');
        }
      } catch (error) {
        console.warn('⚠️ Cannot reach server. Run diagnostics with Cmd+Shift+D');
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

  const handleClearConversation = () => {
    if (confirm('Clear conversation history?')) {
      clearConversation();
    }
  };

  const handleSearchResultClick = (messageId: string) => {
    setSearchMessageId(messageId);
    scrollToBottom();
    // Scroll to message will be handled by ChatMessageList
  };

  return (
    <div className="flex flex-col h-full relative chat-container overflow-hidden min-h-0 bg-black w-full">
      {/* Minimal header - ChatGPT style */}
      <div className="border-b border-white/10 bg-black/40 backdrop-blur-sm px-4 sm:px-4 py-3 sm:py-2 flex items-center justify-between flex-shrink-0">
        <h2 className="text-xs sm:text-sm font-semibold text-white/90">Lore Book</h2>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="text-white/60 hover:text-white h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
            title="Search conversation (⌘K)"
          >
            <SearchIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
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
            loadConversation();
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
          <div className="flex-1 overflow-y-auto">
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
          onUploadComplete={async () => {
            // Refresh all data
            await Promise.all([
              refreshEntries(),
              refreshTimeline(),
              refreshChapters()
            ]);
            // Reload conversation to show new entries
            loadConversation();
          }}
        />
      </div>

    </div>
  );
};

