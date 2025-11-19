import { useState, useRef, useEffect } from 'react';
import { BookOpen, Bot, Send, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { fetchJson } from '../../lib/api';
import { useChatStream } from '../../hooks/useChatStream';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { useLoreNavigatorData } from '../../hooks/useLoreNavigatorData';
import { LoreNavigator, type SelectedItem } from './LoreNavigator';
import { LoreContentViewer } from './LoreContentViewer';

type BiographyMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export const BiographyEditor = () => {
  const [messages, setMessages] = useState<BiographyMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { streamChat, isStreaming, cancel } = useChatStream();
  const { data, loading: dataLoading, refresh: refreshData } = useLoreNavigatorData();

  useEffect(() => {
    // Start with a welcome message
    const welcomeMessage: BiographyMessage = {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm your Lore Book Assistant. I can help you:\n\n- Navigate and edit your biography sections\n- Update character profiles\n- Enhance location descriptions\n- Refine chapter summaries\n- Create new content across all your lore\n\nSelect an item from the sidebar to view and edit it, or just ask me anything!",
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessageId]);

  const handleEdit = (item: SelectedItem) => {
    if (!item) return;
    
    let editPrompt = '';
    switch (item.type) {
      case 'biography': {
        const section = data.biography.find(s => s.id === item.id);
        editPrompt = section ? `Edit the biography section "${section.title}"` : '';
        break;
      }
      case 'character': {
        const character = data.characters.find(c => c.id === item.id);
        editPrompt = character ? `Edit the character "${character.name}"` : '';
        break;
      }
      case 'location': {
        const location = data.locations.find(l => l.id === item.id);
        editPrompt = location ? `Edit the location "${location.name}"` : '';
        break;
      }
      case 'chapter': {
        const chapter = data.chapters.find(c => c.id === item.id);
        editPrompt = chapter ? `Edit the chapter "${chapter.title}"` : '';
        break;
      }
    }
    
    if (editPrompt) {
      setInput(editPrompt);
      inputRef.current?.focus();
    }
  };

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || loading || isStreaming) return;

    const userMessage: BiographyMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Create streaming message
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: BiographyMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingMessageId(assistantMessageId);

      // Build conversation history
      const conversationHistory = [...messages, userMessage]
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      let accumulatedContent = '';

      // Stream the response with context awareness
      await streamChat(
        textToSend,
        conversationHistory.slice(0, -1), // Exclude current message
        (chunk: string) => {
          accumulatedContent += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: accumulatedContent }
                : msg
            )
          );
        },
        () => {}, // metadata callback
        async () => {
          // Complete callback
          setStreamingMessageId(null);
          
          // Refresh data after AI interaction
          await refreshData();
        },
        (error: string) => {
          setStreamingMessageId(null);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: `Error: ${error}` }
                : msg
            )
          );
        }
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: BiographyMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setStreamingMessageId(null);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Keyboard shortcuts for navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle if not typing in input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return;
      }

      // Arrow keys to navigate through items
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const allItems: Array<{ type: SelectedItem['type']; id: string }> = [
          ...data.biography.map(s => ({ type: 'biography' as const, id: s.id })),
          ...data.characters.map(c => ({ type: 'character' as const, id: c.id })),
          ...data.locations.map(l => ({ type: 'location' as const, id: l.id })),
          ...data.chapters.map(c => ({ type: 'chapter' as const, id: c.id }))
        ];

        if (allItems.length === 0) return;

        const currentIndex = selectedItem
          ? allItems.findIndex(item => item.type === selectedItem.type && item.id === selectedItem.id)
          : -1;

        let nextIndex: number;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex < allItems.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : allItems.length - 1;
        }

        setSelectedItem(allItems[nextIndex]);
      }

      // 'E' key to focus edit input
      if (e.key === 'e' && selectedItem) {
        e.preventDefault();
        handleEdit(selectedItem);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem, data.biography, data.characters, data.locations, data.chapters]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border/50 p-4 bg-black/40">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold text-white">Lore Book Navigator</h1>
            <p className="text-sm text-white/60">Navigate and edit your biography, characters, locations, and chapters</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Navigator */}
        <div className="w-64 flex-shrink-0">
          {dataLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <LoreNavigator
              data={data}
              selectedItem={selectedItem}
              onSelectItem={setSelectedItem}
            />
          )}
        </div>

        {/* Center - Content Viewer */}
        <div className="flex-1 border-r border-border/50">
          {dataLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <LoreContentViewer
              data={data}
              selectedItem={selectedItem}
              onEdit={handleEdit}
            />
          )}
        </div>

        {/* Right Sidebar - Chat Interface */}
        <div className="w-96 flex flex-col border-l border-border/50 bg-black/20">
          {/* Chat Header */}
          <div className="border-b border-border/50 p-4 bg-black/40">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-white">AI Assistant</h3>
            </div>
            <p className="text-xs text-white/60 mt-1">
              {selectedItem 
                ? `Editing: ${selectedItem.type === 'biography' ? data.biography.find(s => s.id === selectedItem.id)?.title : 
                           selectedItem.type === 'character' ? data.characters.find(c => c.id === selectedItem.id)?.name :
                           selectedItem.type === 'location' ? data.locations.find(l => l.id === selectedItem.id)?.name :
                           data.chapters.find(c => c.id === selectedItem.id)?.title}`
                : 'Chat to create, edit, or organize your lore'}
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <Card
                  className={`max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-black/40 border-border/50'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="prose prose-invert max-w-none">
                      <MarkdownRenderer content={message.content || '...'} />
                    </div>
                    {message.id === streamingMessageId && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-white/50">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Writing...</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border/50 p-4 bg-black/40">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedItem 
                  ? `Edit ${selectedItem.type}...`
                  : "Ask me to create, edit, or organize your lore..."}
                className="flex-1 bg-black/60 border-border/50 text-white resize-none"
                rows={3}
                disabled={loading || isStreaming}
              />
              <Button
                type="submit"
                disabled={!input.trim() || loading || isStreaming}
                className="self-end"
              >
                {loading || isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
            <p className="text-xs text-white/40 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

