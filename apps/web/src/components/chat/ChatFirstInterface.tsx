import { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, Download, Search as SearchIcon, X } from 'lucide-react';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { useChatStream } from '../../hooks/useChatStream';
import { ChatMessage, type Message, type ChatSource } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import { ChatLoadingPulse } from './ChatLoadingPulse';
import { ChatSourcesBar } from './ChatSourcesBar';
import { ChatSourceNavigator } from './ChatSourceNavigator';
import { ChatSearch } from './ChatSearch';
import { parseSlashCommand, handleSlashCommand } from '../../utils/chatCommands';
import { exportConversationAsMarkdown, exportConversationAsJSON, downloadFile } from '../../utils/exportConversation';
import { fetchJson } from '../../lib/api';
import { Button } from '../ui/button';
import { diagnoseEndpoints, logDiagnostics } from '../../utils/errorDiagnostics';

const CONVERSATION_STORAGE_KEY = 'lorekeeper_chat_conversation';

export const ChatFirstInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'analyzing' | 'searching' | 'connecting' | 'reasoning' | 'generating'>('analyzing');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<ChatSource | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMessageId, setSearchMessageId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { refreshEntries, refreshTimeline, refreshChapters } = useLoreKeeper();
  const { streamChat, isStreaming, cancel } = useChatStream();

  // Load conversation from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONVERSATION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })));
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, []);

  // Save conversation to localStorage whenever messages change
  useEffect(() => {
    try {
      localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessageId]);

  const handleSend = async (messageText: string) => {
    if (!messageText.trim() || loading) return;

    // Check for slash commands
    const parsed = parseSlashCommand(messageText.trim());
    if (parsed) {
      const result = await handleSlashCommand(parsed.command, parsed.args);
      if (result) {
        if (result.type === 'navigation' && result.navigation) {
          // Handle navigation commands
          // This would need to be passed up to App.tsx to change surfaces
          console.log('Navigate to:', result.navigation);
          return;
        } else if (result.type === 'message') {
          // Add command response as assistant message
          const commandMessage: Message = {
            id: `command-${Date.now()}`,
            role: 'assistant',
            content: result.content || 'Command executed.',
            timestamp: new Date()
          };
          setMessages((prev) => [...prev, commandMessage]);
          return;
        }
      }
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setLoadingStage('analyzing');

    // Build conversation history
    const conversationHistory = [...messages, userMessage]
      .slice(-10)
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }));

    // Create placeholder for streaming message
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setStreamingMessageId(assistantMessageId);

    let accumulatedContent = '';
    let metadata: any = null;

    try {
      await streamChat(
        messageText.trim(),
        conversationHistory.slice(0, -1), // Exclude the current message
        (chunk) => {
          // Update streaming message
          accumulatedContent += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: accumulatedContent }
                : msg
            )
          );
          setLoadingStage('generating');
        },
        (meta) => {
          metadata = meta;
          setLoadingStage('connecting');
        },
        () => {
          // Complete
          setLoading(false);
          setStreamingMessageId(null);
          setLoadingStage('analyzing');
          
          // Update message with final metadata
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: accumulatedContent,
                    isStreaming: false,
                    ...metadata,
                    sources: metadata?.sources,
                    connections: metadata?.connections,
                    continuityWarnings: metadata?.continuityWarnings,
                    timelineUpdates: metadata?.timelineUpdates
                  }
                : msg
            )
          );

          // Refresh data
          Promise.all([
            refreshEntries(),
            refreshTimeline(),
            refreshChapters()
          ]).catch(console.error);
        },
        (error) => {
          setLoading(false);
          setStreamingMessageId(null);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: `Sorry, I encountered an error: ${error}`,
                    isStreaming: false
                  }
                : msg
            )
          );
        }
      );
    } catch (error) {
      setLoading(false);
      setStreamingMessageId(null);
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== assistantMessageId)
      );
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleCopy = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      navigator.clipboard.writeText(message.content);
    }
  };

  const handleRegenerate = async (messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const userMessage = messages[messageIndex - 1];
    if (!userMessage || userMessage.role !== 'user') return;

    // Remove the old assistant message
    setMessages((prev) => prev.filter(m => m.id !== messageId));

    // Resend
    await handleSend(userMessage.content);
  };

  const handleEdit = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.role === 'user') {
      setInput(message.content);
      // Remove the message and any following assistant messages
      const messageIndex = messages.findIndex(m => m.id === messageId);
      setMessages((prev) => prev.slice(0, messageIndex));
    }
  };

  const handleDelete = (messageId: string) => {
    setMessages((prev) => prev.filter(m => m.id !== messageId));
  };

  const handleSourceClick = (source: ChatSource) => {
    setSelectedSource(source);
  };

  const handleNavigateToSource = (surface: 'timeline' | 'characters' | 'memoir', id?: string) => {
    setSelectedSource(null);
    // This would need to be passed as a prop from App.tsx to actually navigate
    console.log('Navigate to:', surface, id);
  };

  const handleExportMarkdown = () => {
    const markdown = exportConversationAsMarkdown(messages);
    const date = new Date().toISOString().split('T')[0];
    downloadFile(markdown, `lorekeeper-chat-${date}.md`, 'text/markdown');
    setShowExportMenu(false);
  };

  const handleExportJSON = () => {
    const json = exportConversationAsJSON(messages);
    const date = new Date().toISOString().split('T')[0];
    downloadFile(json, `lorekeeper-chat-${date}.json`, 'application/json');
    setShowExportMenu(false);
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: Record<string, Message[]> = {};
    messages.forEach((msg) => {
      const date = msg.timestamp.toLocaleDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(msg);
    });
    return groups;
  }, [messages]);

  const scrollToMessage = (messageId: string) => {
    const element = messageRefs.current.get(messageId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-primary/50');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary/50');
      }, 2000);
    }
  };

  const handleClearConversation = () => {
    if (confirm('Clear conversation history?')) {
      setMessages([]);
      localStorage.removeItem(CONVERSATION_STORAGE_KEY);
    }
  };

  const handleFeedback = (messageId: string, feedback: 'positive' | 'negative') => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, feedback: msg.feedback === feedback ? null : feedback }
          : msg
      )
    );
    // Could send feedback to backend for learning
    console.log('Feedback:', messageId, feedback);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(!showSearch);
      }
      // Cmd+/ or Ctrl+/ for commands
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        // Focus on input and add /
        const textarea = document.querySelector('textarea[placeholder*="Type your message"]') as HTMLTextAreaElement;
        if (textarea) {
          textarea.focus();
          textarea.value = '/';
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      // Cmd+Shift+D for diagnostics
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        diagnoseEndpoints('/api').then(logDiagnostics);
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        if (showSearch) setShowSearch(false);
        if (selectedSource) setSelectedSource(null);
        if (showExportMenu) setShowExportMenu(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, selectedSource, showExportMenu]);

  // Auto-diagnose on mount if there are errors
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

  return (
    <div className="flex flex-col h-full relative">
      {/* Header with Actions */}
      <div className="border-b border-border/60 bg-black/20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white/80">Chat</h2>
          {messages.length > 0 && (
            <span className="text-xs text-white/40">
              {messages.length} message{messages.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch(!showSearch)}
            className="text-white/60 hover:text-white"
            title="Search conversation (⌘K)"
          >
            <SearchIcon className="h-4 w-4" />
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="text-white/60 hover:text-white"
              title="Export conversation"
            >
              <Download className="h-4 w-4" />
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-black/90 border border-border/60 rounded-lg p-1 z-50 min-w-[150px]">
                <button
                  onClick={handleExportMarkdown}
                  className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-black/60 rounded transition-colors"
                >
                  Export as Markdown
                </button>
                <button
                  onClick={handleExportJSON}
                  className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-black/60 rounded transition-colors"
                >
                  Export as JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <ChatSearch
          messages={messages}
          onResultClick={(messageId) => {
            setSearchMessageId(messageId);
            scrollToMessage(messageId);
          }}
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
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-white/60">
            <Bot className="h-12 w-12 mx-auto mb-4 text-primary/50" />
            <h2 className="text-xl font-semibold mb-2">AI Life Guidance Chat</h2>
            <p className="text-sm mb-4">
              Dump everything freely here. I'll reflect back, make connections,<br />
              and help you understand your story while automatically updating your timeline.
            </p>
            <div className="text-xs text-white/40 space-y-1 max-w-md mx-auto">
              <p>✨ I'll track dates, times, and occurrences</p>
              <p>🔗 I'll make connections to your past entries</p>
              <p>📖 I'll update your timeline, memoir, and chapters</p>
              <p>⚠️ I'll check for continuity and conflicts</p>
              <p>💡 I'll provide strategic guidance based on your patterns</p>
            </div>
            <div className="mt-6 text-xs text-white/30">
              <p>Try commands: <span className="font-mono text-primary/70">/recent</span>, <span className="font-mono text-primary/70">/search</span>, <span className="font-mono text-primary/70">/characters</span></p>
            </div>
          </div>
        )}

        {/* Grouped Messages by Date */}
        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
          <div key={date}>
            {/* Date Header */}
            <div className="sticky top-0 z-10 flex items-center gap-4 my-4">
              <div className="flex-1 border-t border-border/30" />
              <span className="text-xs text-white/40 font-medium px-3 py-1 bg-black/60 rounded-full border border-border/30">
                {date === new Date().toLocaleDateString() ? 'Today' : date}
              </span>
              <div className="flex-1 border-t border-border/30" />
            </div>
            
            {/* Messages for this date */}
            {dateMessages.map((message) => (
              <div
                key={message.id}
                ref={(el) => {
                  if (el) {
                    messageRefs.current.set(message.id, el);
                  } else {
                    messageRefs.current.delete(message.id);
                  }
                }}
                className={message.id === searchMessageId ? 'ring-2 ring-primary/50 rounded-lg' : ''}
              >
                <ChatMessage
                  message={message}
                  onCopy={() => handleCopy(message.id)}
                  onRegenerate={message.role === 'assistant' ? () => handleRegenerate(message.id) : undefined}
                  onEdit={message.role === 'user' ? () => handleEdit(message.id) : undefined}
                  onDelete={() => handleDelete(message.id)}
                  onSourceClick={handleSourceClick}
                  onFeedback={handleFeedback}
                />
              </div>
            ))}
          </div>
        ))}

        {/* Loading Indicator */}
        {loading && !streamingMessageId && (
          <ChatLoadingPulse stage={loadingStage} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sources Bar */}
      {messages.length > 0 && (
        <ChatSourcesBar
          sources={messages
            .filter(m => m.role === 'assistant' && m.sources)
            .flatMap(m => m.sources || [])
            .slice(-10)}
          onSourceClick={handleSourceClick}
        />
      )}

      {/* Composer */}
      <ChatComposer
        input={input}
        onInputChange={setInput}
        onSubmit={handleSend}
        loading={loading || isStreaming}
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
