import { useState, useRef, useEffect } from 'react';
import { Bot, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { useChatStream } from '../../hooks/useChatStream';
import { ChatMessage, type Message } from '../chat/ChatMessage';
import { ChatComposer } from '../chat/ChatComposer';
import { ChatLoadingPulse } from '../chat/ChatLoadingPulse';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { fetchJson } from '../../lib/api';

type ChapterCreationChatbotProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreateChapter: (payload: {
    title: string;
    startDate: string;
    endDate?: string | null;
    description?: string | null;
  }) => Promise<void>;
};

type ExtractedChapterData = {
  title?: string;
  startDate?: string;
  endDate?: string | null;
  description?: string | null;
};

export const ChapterCreationChatbot = ({ isOpen, onClose, onCreateChapter }: ChapterCreationChatbotProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'analyzing' | 'searching' | 'connecting' | 'reasoning' | 'generating'>('analyzing');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedChapterData>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { refreshEntries, refreshTimeline, refreshChapters } = useLoreKeeper();
  const { streamChat, isStreaming } = useChatStream();

  // Initialize with welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I'm here to help you create a new chapter for your story. 

Tell me about the chapter you want to create. I'll help you:
- Come up with a great title
- Set the right dates
- Write a meaningful description

You can say things like:
- "I want to create a chapter about my journey learning to code"
- "A chapter starting in January 2024 about my new job"
- "The chapter where I moved to a new city"

What would you like this chapter to be about?`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingMessageId, isOpen]);

  const extractChapterInfo = async (conversation: string): Promise<ExtractedChapterData> => {
    try {
      const response = await fetchJson<{ 
        title?: string; 
        startDate?: string; 
        endDate?: string | null; 
        description?: string;
      }>('/api/chapters/extract-info', {
        method: 'POST',
        body: JSON.stringify({ conversation })
      });
      return response;
    } catch (error) {
      // Fallback: try to extract basic info from conversation
      const lines = conversation.split('\n');
      const titleMatch = conversation.match(/title[:\s]+["']?([^"'\n]+)["']?/i) || 
                        conversation.match(/chapter[:\s]+["']?([^"'\n]+)["']?/i);
      const dateMatch = conversation.match(/(\d{4}-\d{2}-\d{2})|(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i);
      
      return {
        title: titleMatch?.[1]?.trim() || undefined,
        startDate: dateMatch ? new Date(dateMatch[0]).toISOString().split('T')[0] : undefined,
        description: lines.slice(-3).join(' ').substring(0, 500)
      };
    }
  };

  const handleSend = async (messageText: string) => {
    if (!messageText.trim() || loading) return;

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
      // Use specialized prompt for chapter creation
      const systemPrompt = `You are a helpful assistant helping the user create a new chapter for their life story journal.

Your goal is to:
1. Understand what the chapter is about
2. Help them come up with a good title
3. Determine appropriate start and end dates
4. Create a meaningful description

Ask clarifying questions if needed, but also try to extract information from what they tell you.
Be conversational and helpful. When you have enough information, summarize what you've learned and ask if they want to create the chapter.

Format dates as YYYY-MM-DD.`;

      await streamChat(
        messageText.trim(),
        [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(0, -1)
        ],
        (chunk) => {
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
        async () => {
          setLoading(false);
          setStreamingMessageId(null);
          setLoadingStage('analyzing');
          
          // Update message with final content
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: accumulatedContent,
                    isStreaming: false
                  }
                : msg
            )
          );

          // Try to extract chapter info from the conversation
          const fullConversation = [...messages, userMessage, { ...assistantMessage, content: accumulatedContent }]
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');
          
          const extracted = await extractChapterInfo(fullConversation);
          setExtractedData(extracted);

          // If we have enough info, show confirmation
          if (extracted.title && extracted.startDate) {
            setTimeout(() => {
              setShowConfirm(true);
            }, 1000);
          }
        },
        (error) => {
          setLoading(false);
          setStreamingMessageId(null);
          setMessages((prev) =>
            prev.filter((msg) => msg.id !== assistantMessageId)
          );
          
          const errorMessage: Message = {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Let's try again!`,
            timestamp: new Date()
          };
          setMessages((prev) => [...prev, errorMessage]);
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
        content: `Sorry, I encountered an error. Let's try again!`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleCreateChapter = async () => {
    if (!extractedData.title || !extractedData.startDate) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'I need at least a title and start date to create the chapter. Let me ask you a few more questions.',
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
      setShowConfirm(false);
      return;
    }

    try {
      await onCreateChapter({
        title: extractedData.title,
        startDate: extractedData.startDate,
        endDate: extractedData.endDate || null,
        description: extractedData.description || null
      });

      // Refresh data
      await Promise.all([
        refreshEntries(),
        refreshTimeline(),
        refreshChapters()
      ]);

      const successMsg: Message = {
        id: `success-${Date.now()}`,
        role: 'assistant',
        content: `✅ Chapter "${extractedData.title}" created successfully! It's been added to your timeline and memory.`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, successMsg]);

      // Close after a moment
      setTimeout(() => {
        onClose();
        // Reset state
        setMessages([]);
        setExtractedData({});
        setShowConfirm(false);
      }, 2000);
    } catch (error) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I couldn't create the chapter: ${error instanceof Error ? error.message : 'Unknown error'}. Let's try again!`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
      setShowConfirm(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] bg-black/95 border border-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-gradient-to-r from-primary/10 to-purple-900/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Chapter Creation Assistant</h2>
              <p className="text-sm text-white/60">I'll help you create your chapter step by step</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto space-y-4 p-6">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onCopy={() => {}}
            />
          ))}

          {/* Confirmation Card */}
          {showConfirm && extractedData.title && extractedData.startDate && (
            <Card className="bg-primary/10 border-primary/30 mt-4">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">Ready to create your chapter?</h3>
                    <div className="space-y-2 text-sm text-white/80">
                      <div>
                        <span className="text-white/60">Title: </span>
                        <span className="font-medium">{extractedData.title}</span>
                      </div>
                      <div>
                        <span className="text-white/60">Start Date: </span>
                        <span className="font-medium">{new Date(extractedData.startDate).toLocaleDateString()}</span>
                      </div>
                      {extractedData.endDate && (
                        <div>
                          <span className="text-white/60">End Date: </span>
                          <span className="font-medium">{new Date(extractedData.endDate).toLocaleDateString()}</span>
                        </div>
                      )}
                      {extractedData.description && (
                        <div>
                          <span className="text-white/60">Description: </span>
                          <span className="font-medium">{extractedData.description.substring(0, 100)}...</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        onClick={handleCreateChapter}
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                      >
                        Create Chapter
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowConfirm(false);
                          setInput('Let me adjust something...');
                        }}
                      >
                        Make Changes
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading Indicator */}
          {loading && !streamingMessageId && (
            <ChatLoadingPulse stage={loadingStage} />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-border/60 bg-black/20">
          <ChatComposer
            input={input}
            onInputChange={setInput}
            onSubmit={handleSend}
            loading={loading || isStreaming}
          />
        </div>
      </div>
    </div>
  );
};

