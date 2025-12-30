import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../hooks/useChat';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useConversationStore } from '../hooks/useConversationStore';
import { ChatHeader } from './ChatHeader';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessageList } from '../message/ChatMessageList';
import { ChatLoadingPulse } from './ChatLoadingPulse';
import { ChatComposer } from '../composer/ChatComposer';
import { ChatSourcesBar } from '../sources/ChatSourcesBar';
import { ChatSourceNavigator } from '../sources/ChatSourceNavigator';
import { ChatSearchModal } from '../search/ChatSearchModal';
import { GuestSignUpPrompt } from '../../../components/guest/GuestSignUpPrompt';
import { useGuest } from '../../../contexts/GuestContext';
import { exportConversationAsMarkdown, exportConversationAsJSON, downloadFile } from '../../../utils/exportConversation';
import { diagnoseEndpoints, logDiagnostics } from '../../../utils/errorDiagnostics';
import { analytics } from '../../../lib/monitoring';
import { fetchJson } from '../../../lib/api';
import type { ChatSource } from '../message/ChatMessage';
import '../styles/chat-theme.css';
import '../styles/message-animations.css';

export const ChatFirstInterface = () => {
  const navigate = useNavigate();
  const conversationStore = useConversationStore();
  const { messageRefs, registerMessageRef, loadConversation, setMessages } = conversationStore;
  
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
    <div className="flex flex-col h-full relative chat-container">
      <ChatHeader
        messageCount={messages.length}
        onSearchClick={() => setShowSearch(!showSearch)}
        onExportMarkdown={handleExportMarkdown}
        onExportJSON={handleExportJSON}
      />

      {/* Search Modal */}
      {showSearch && (
        <ChatSearchModal
          messages={messages}
          isOpen={showSearch}
          onResultClick={handleSearchResultClick}
          onClose={() => setShowSearch(false)}
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
      {messages.length === 0 ? (
        <ChatEmptyState />
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
        <div className="px-4">
          <ChatLoadingPulse stage={loadingStage} progress={loadingProgress} />
        </div>
      )}

      <div ref={messagesEndRef} />

      {/* Sources Bar */}
      {messages.length > 0 && (
        <ChatSourcesBar
          sources={sources}
          onSourceClick={handleSourceClick}
        />
      )}

      {/* Guest Sign-Up Prompt */}
      {isGuest && !canSendChatMessage() && (
        <div className="px-4 pb-4">
          <GuestSignUpPrompt />
        </div>
      )}

      {/* Composer */}
      <ChatComposer
        onSubmit={sendMessage}
        loading={isLoading}
        disabled={isGuest && !canSendChatMessage()}
      />

      {/* Footer Actions */}
      {messages.length > 0 && (
        <div className="px-4 pb-2 flex items-center justify-between border-t border-border/30 pt-2">
          <button
            onClick={handleClearConversation}
            className="text-xs text-white/30 hover:text-white/50 transition-colors"
          >
            Clear conversation
          </button>
          <div className="flex items-center gap-3 text-xs text-white/30">
            <span>Press ⌘K to search</span>
            <span>•</span>
            <span>Press ⌘/ for commands</span>
          </div>
        </div>
      )}
    </div>
  );
};

