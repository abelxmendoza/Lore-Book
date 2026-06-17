import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Send, Loader2, Sparkles, PanelLeftClose, PanelLeftOpen,
  MessageSquare, X, ChevronLeft, BookMarked, List, FileText,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { useChatStream } from '../../hooks/useChatStream';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { useLoreNavigatorData } from '../../hooks/useLoreNavigatorData';
import { LoreNavigator, type SelectedItem } from './LoreNavigator';
import { LoreContentViewer } from './LoreContentViewer';
import { BiographyGenerator } from './BiographyGenerator';
import { lorebookReadUrl, isDemoBookId } from '../../lib/lorebookLibrary';
import { getDemoLorebookById } from '../../mocks/lorebooks';
import { fetchJson } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type BiographyMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

type MobileTab = 'browse' | 'content' | 'chat';

// ─── Chat panel (shared across mobile/desktop) ───────────────────────────────

interface ChatPanelProps {
  messages: BiographyMessage[];
  streamingMessageId: string | null;
  input: string;
  loading: boolean;
  isStreaming: boolean;
  selectedItem: SelectedItem;
  data: ReturnType<typeof useLoreNavigatorData>['data'];
  inputRef: React.RefObject<HTMLTextAreaElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onClose?: () => void;
  className?: string;
}

const ChatPanel = ({
  messages, streamingMessageId, input, loading, isStreaming,
  selectedItem, data, inputRef, messagesEndRef,
  onInputChange, onSend, onKeyDown, onClose, className = '',
}: ChatPanelProps) => (
  <div className={`flex flex-col bg-black/20 ${className}`}>
    {/* Chat header */}
    <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-black/40 shrink-0">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-white">AI Assistant</span>
      </div>
      <div className="flex items-center gap-2">
        <p className="hidden sm:block text-xs text-white/40 truncate max-w-[180px]">
          {selectedItem
            ? `Editing: ${
                selectedItem.type === 'biography'
                  ? data.biography.find(s => s.id === selectedItem.id)?.title
                  : selectedItem.type === 'character'
                  ? data.characters.find(c => c.id === selectedItem.id)?.name
                  : selectedItem.type === 'location'
                  ? data.locations.find(l => l.id === selectedItem.id)?.name
                  : data.chapters.find(c => c.id === selectedItem.id)?.title
              }`
            : 'Select an item to start editing'}
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-white/40 hover:text-white transition-colors"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>

    {/* Messages */}
    <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
      {messages.map(message => (
        <div
          key={message.id}
          className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {message.role === 'assistant' && (
            <div className="shrink-0 w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
          )}
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              message.role === 'user'
                ? 'bg-primary/15 border border-primary/20 text-white rounded-br-sm'
                : 'bg-white/5 border border-white/8 text-white/90 rounded-bl-sm'
            }`}
          >
            <div className="prose prose-invert prose-sm max-w-none">
              <MarkdownRenderer content={message.content || '…'} />
            </div>
            {message.id === streamingMessageId && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-white/40">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                <span>Writing…</span>
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>

    {/* Input */}
    <div className="border-t border-border/50 p-3 bg-black/40 shrink-0">
      <form
        onSubmit={e => { e.preventDefault(); onSend(); }}
        className="flex gap-2 items-end"
      >
        <Textarea
          ref={inputRef}
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={selectedItem ? `Edit ${selectedItem.type}…` : 'Ask me to create, edit, or organize your lore…'}
          className="flex-1 bg-black/60 border-border/50 text-white resize-none text-sm min-h-[44px] max-h-[120px]"
          rows={2}
          disabled={loading || isStreaming}
        />
        <Button
          type="submit"
          disabled={!input.trim() || loading || isStreaming}
          className="self-end shrink-0 h-9 w-9 p-0"
        >
          {loading || isStreaming
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className="h-4 w-4" />}
        </Button>
      </form>
      <p className="text-xs text-white/30 mt-1.5 pl-0.5">Enter to send · Shift+Enter for new line</p>
    </div>
  </div>
);

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────

interface BottomTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  unreadChat: boolean;
}

const BottomTabBar = ({ activeTab, onTabChange, unreadChat }: BottomTabBarProps) => {
  const tabs: Array<{ id: MobileTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'browse',  label: 'Browse',  icon: List },
    { id: 'content', label: 'Content', icon: FileText },
    { id: 'chat',    label: 'AI Chat', icon: MessageSquare },
  ];

  return (
    <div className="md:hidden flex items-center border-t border-border/60 bg-black/90 backdrop-blur-sm shrink-0"
         style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors relative ${
              isActive ? 'text-primary' : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
            {tab.id === 'chat' && unreadChat && !isActive && (
              <span className="absolute top-2 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const BiographyEditor = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('book');
  const demoBook = bookId ? getDemoLorebookById(bookId) : undefined;
  const [apiBookTitle, setApiBookTitle] = useState<string | null>(null);
  const bookTitle = demoBook?.title ?? apiBookTitle ?? null;

  useEffect(() => {
    if (!bookId || isDemoBookId(bookId)) {
      setApiBookTitle(null);
      return;
    }
    void (async () => {
      try {
        const result = await fetchJson<{ biography: { title: string } }>(`/api/biography/${bookId}`);
        setApiBookTitle(result.biography.title);
      } catch {
        setApiBookTitle(null);
      }
    })();
  }, [bookId]);

  // Chat state
  const [messages, setMessages] = useState<BiographyMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [unreadChat, setUnreadChat] = useState(false);

  // Navigation state
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);

  // Layout state
  const [showGenerator, setShowGenerator] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('browse');
  const [showNavDesktop, setShowNavDesktop] = useState(true);
  const [showChatDesktop, setShowChatDesktop] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { streamChat, isStreaming } = useChatStream();
  const { data, loading: dataLoading, refresh: refreshData } = useLoreNavigatorData(bookId);

  // Welcome message
  useEffect(() => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm your Biography Editor assistant.\n\n- Edit biography sections, characters, locations, and chapters\n- Ask me to draft new content or refine existing sections\n- Select any item from Browse and I'll focus on it\n\nWhat would you like to work on?",
      timestamp: new Date(),
    }]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessageId]);

  // Mark unread when new AI message arrives and chat isn't the active mobile tab
  useEffect(() => {
    if (messages.length > 1 && messages[messages.length - 1].role === 'assistant') {
      if (mobileTab !== 'chat') setUnreadChat(true);
    }
  }, [messages]);

  const handleMobileTabChange = (tab: MobileTab) => {
    setMobileTab(tab);
    if (tab === 'chat') setUnreadChat(false);
  };

  const handleEdit = useCallback((item: SelectedItem) => {
    if (!item) return;
    let prompt = '';
    switch (item.type) {
      case 'biography': { const s = data.biography.find(s => s.id === item.id); prompt = s ? `Edit the biography section "${s.title}"` : ''; break; }
      case 'character': { const c = data.characters.find(c => c.id === item.id); prompt = c ? `Edit the character "${c.name}"` : ''; break; }
      case 'location':  { const l = data.locations.find(l => l.id === item.id); prompt = l ? `Edit the location "${l.name}"` : ''; break; }
      case 'chapter':   { const ch = data.chapters.find(c => c.id === item.id); prompt = ch ? `Edit the chapter "${ch.title}"` : ''; break; }
    }
    if (prompt) {
      setInput(prompt);
      inputRef.current?.focus();
    }
  }, [data]);

  const handleSelectItem = useCallback((item: SelectedItem) => {
    setSelectedItem(item);
    // On mobile, selecting an item in Browse auto-switches to Content
    setMobileTab('content');
  }, []);

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || loading || isStreaming) return;

    const userMessage: BiographyMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const assistantMessageId = `assistant-${Date.now()}`;
      setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }]);
      setStreamingMessageId(assistantMessageId);

      const conversationHistory = [...messages, userMessage].slice(-10).map(m => ({ role: m.role, content: m.content }));
      let accumulated = '';

      await streamChat(
        textToSend,
        conversationHistory.slice(0, -1),
        (chunk: string) => {
          accumulated += chunk;
          setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: accumulated } : m));
        },
        () => {},
        async () => {
          setStreamingMessageId(null);
          await refreshData();
        },
        (error: string) => {
          setStreamingMessageId(null);
          setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: `Error: ${error}` } : m));
        },
      );
    } catch (error) {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, something went wrong: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setStreamingMessageId(null);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  };

  // Keyboard navigation (desktop)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const allItems: Array<{ type: 'biography' | 'character' | 'location' | 'chapter'; id: string }> = [
          ...data.biography.map(s => ({ type: 'biography' as const, id: s.id })),
          ...data.characters.map(c => ({ type: 'character' as const, id: c.id })),
          ...data.locations.map(l => ({ type: 'location' as const, id: l.id })),
          ...data.chapters.map(c => ({ type: 'chapter' as const, id: c.id })),
        ];
        if (!allItems.length) return;
        const cur = selectedItem ? allItems.findIndex(i => i.type === selectedItem.type && i.id === selectedItem.id) : -1;
        const next = e.key === 'ArrowDown' ? (cur < allItems.length - 1 ? cur + 1 : 0) : (cur > 0 ? cur - 1 : allItems.length - 1);
        setSelectedItem(allItems[next]);
      }
      if (e.key === 'e' && selectedItem) { e.preventDefault(); handleEdit(selectedItem); }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedItem, data, handleEdit]);

  const chatPanelProps: Omit<ChatPanelProps, 'className' | 'onClose'> = {
    messages, streamingMessageId, input, loading, isStreaming,
    selectedItem, data, inputRef, messagesEndRef,
    onInputChange: setInput, onSend: handleSend, onKeyDown: handleKeyDown,
  };

  return (
    <div className="flex flex-col h-full bg-black/20 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 sm:px-4 py-2.5 bg-black/60 backdrop-blur-sm shrink-0 gap-3">
        {/* Left: back + title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => navigate(bookId ? lorebookReadUrl(bookId) : '/lorebook')}
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors shrink-0 font-mono"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{bookId ? 'Back to book' : 'LoreBooks'}</span>
          </button>
          <div className="w-px h-3.5 bg-white/10 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <BookMarked className="h-4 w-4 text-primary shrink-0" />
            <h1 className="text-sm font-semibold text-white truncate">
              {bookTitle ?? 'Lore Editor'}
            </h1>
            {selectedItem && (
              <>
                <span className="text-white/20 shrink-0">/</span>
                <span className="text-xs text-white/50 truncate capitalize">{selectedItem.type}</span>
              </>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowGenerator(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              showGenerator
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-white/10 text-white/50 hover:text-white hover:border-white/20'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Generate</span>
          </button>

          {/* Chat toggle — desktop only */}
          <button
            type="button"
            onClick={() => setShowChatDesktop(v => !v)}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              showChatDesktop
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-white/10 text-white/50 hover:text-white hover:border-white/20'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          {/* Nav toggle — desktop only */}
          <button
            type="button"
            onClick={() => setShowNavDesktop(v => !v)}
            className="hidden md:flex p-1.5 rounded-lg text-white/40 hover:text-white transition-colors"
            aria-label={showNavDesktop ? 'Collapse navigator' : 'Expand navigator'}
          >
            {showNavDesktop
              ? <PanelLeftClose className="h-4 w-4" />
              : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Generate Biography panel ── */}
      {showGenerator && (
        <div className="border-b border-border/50 p-4 bg-black/30 shrink-0">
          <BiographyGenerator
            onBiographyGenerated={() => {
              setShowGenerator(false);
              void refreshData();
            }}
          />
        </div>
      )}

      {/* ── Desktop body: nav | content | chat ── */}
      <div className="hidden md:flex flex-1 overflow-hidden min-h-0">
        {/* Navigator sidebar */}
        {showNavDesktop && (
          <div className="w-60 shrink-0 border-r border-border/50 overflow-y-auto">
            {dataLoading
              ? <div className="h-full flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              : <LoreNavigator data={data} selectedItem={selectedItem} onSelectItem={setSelectedItem} />}
          </div>
        )}

        {/* Content viewer */}
        <div className={`flex-1 overflow-y-auto ${showChatDesktop ? 'border-r border-border/50' : ''}`}>
          {dataLoading
            ? <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            : <LoreContentViewer data={data} selectedItem={selectedItem} onEdit={handleEdit} />}
        </div>

        {/* Chat panel */}
        {showChatDesktop && (
          <ChatPanel
            {...chatPanelProps}
            onClose={() => setShowChatDesktop(false)}
            className="w-80 xl:w-96 shrink-0 border-l border-border/50"
          />
        )}
      </div>

      {/* ── Mobile body: tab panels ── */}
      <div className="flex md:hidden flex-1 overflow-hidden min-h-0">
        {mobileTab === 'browse' && (
          <div className="flex-1 overflow-y-auto">
            {dataLoading
              ? <div className="h-full flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              : <LoreNavigator data={data} selectedItem={selectedItem} onSelectItem={handleSelectItem} />}
          </div>
        )}

        {mobileTab === 'content' && (
          <div className="flex-1 overflow-y-auto">
            {dataLoading
              ? <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              : <LoreContentViewer data={data} selectedItem={selectedItem} onEdit={item => { handleEdit(item); setMobileTab('chat'); }} />}
          </div>
        )}

        {mobileTab === 'chat' && (
          <ChatPanel
            {...chatPanelProps}
            className="flex-1"
          />
        )}
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <BottomTabBar
        activeTab={mobileTab}
        onTabChange={handleMobileTabChange}
        unreadChat={unreadChat}
      />
    </div>
  );
};
