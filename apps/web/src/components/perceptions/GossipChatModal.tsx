import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, MessageSquare, Eye, Sparkles, UserPlus, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { ChatComposer } from '../../features/chat/composer/ChatComposer';
import { ChatMessage } from '../../features/chat/message/ChatMessage';
import type { Message } from '../../features/chat/message/ChatMessage';
import { useChatStream } from '../../hooks/useChatStream';
import { fetchJson } from '../../lib/api';
import { perceptionApi } from '../../api/perceptions';
import { Loader2 } from 'lucide-react';

interface GossipChatModalProps {
  onClose: () => void;
  onPerceptionsCreated?: () => void;
}

export const GossipChatModal: React.FC<GossipChatModalProps> = ({
  onClose,
  onPerceptionsCreated
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [lastExtraction, setLastExtraction] = useState<{
    perceptionsFound: number;
    perceptionsCreated: number;
    charactersCreated: number;
    charactersLinked: number;
    needsFraming: boolean;
  } | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const conversationHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const { streamChat } = useChatStream();

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isExtracting]);

  // Initial welcome message
  useEffect(() => {
    const welcomeMessage: Message = {
      id: 'welcome',
      role: 'assistant',
      content: `Hey! Ready to gossip? 😏 Just chat naturally about what you heard, saw, or believe about people. I'll automatically:

✨ Detect perceptions and create entries
👥 Create new characters if mentioned
🔗 Link to existing characters
💭 Connect to your memory bank

Just talk naturally - like you're texting a friend! What did you hear?`,
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  }, []);

  // Handle chat message
  const handleChatMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading || isExtracting) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    conversationHistoryRef.current.push({ role: 'user', content: message });
    setIsLoading(true);
    setIsExtracting(true);

    try {
      // First, extract perceptions from the message
      const extractionResponse = await fetchJson<{
        extraction: {
          perceptions: Array<{
            subject_alias: string;
            content: string;
            source: string;
            confidence_level: number;
          }>;
          charactersCreated: Array<{ id: string; name: string }>;
          charactersLinked: Array<{ id: string; name: string }>;
          needsFraming: boolean;
        };
        created: Array<{ id: string; subject_alias: string }>;
        summary: {
          perceptionsFound: number;
          perceptionsCreated: number;
          charactersCreated: number;
          charactersLinked: number;
          needsFraming: boolean;
        };
      }>('/api/perceptions/extract-from-chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          conversationHistory: conversationHistoryRef.current.slice(-10) // Last 10 messages for context
        })
      });

      const { extraction, created, summary } = extractionResponse;
      setLastExtraction(summary);

      // Build assistant response
      let assistantContent = '';
      
      if (summary.perceptionsCreated > 0) {
        assistantContent += `✨ **${summary.perceptionsCreated} perception${summary.perceptionsCreated > 1 ? 's' : ''} created!**\n\n`;
        
        created.forEach((p, idx) => {
          assistantContent += `${idx + 1}. About **${p.subject_alias}**\n`;
        });
        
        assistantContent += '\n';
      }

      if (summary.charactersCreated > 0) {
        assistantContent += `👥 **${summary.charactersCreated} new character${summary.charactersCreated > 1 ? 's' : ''} added** to your lorebook!\n\n`;
        extraction.charactersCreated.forEach((char, idx) => {
          assistantContent += `- ${char.name}\n`;
        });
        assistantContent += '\n';
      }

      if (summary.charactersLinked > 0) {
        assistantContent += `🔗 **Linked to ${summary.charactersLinked} existing character${summary.charactersLinked > 1 ? 's' : ''}**\n\n`;
        extraction.charactersLinked.forEach((char, idx) => {
          assistantContent += `- ${char.name}\n`;
        });
        assistantContent += '\n';
      }

      if (summary.needsFraming) {
        assistantContent += `⚠️ Some content needed perception framing - I've adjusted it to "I heard that..." format.\n\n`;
      }

      if (summary.perceptionsCreated === 0 && summary.charactersCreated === 0) {
        assistantContent = `Hmm, I didn't detect any clear perceptions or new characters in that message. `;
        assistantContent += `Try being more specific about what you heard or believe about someone. `;
        assistantContent += `For example: "I heard that Sarah got a new job" or "Someone told me Alex is moving."`;
      } else {
        assistantContent += `Everything's been saved to your lorebook! What else did you hear? 👂`;
      }

      // Get AI chat response for natural conversation
      const contextPrompt = `You are a friendly, casual gossip chat bot. The user just shared: "${message}"

I've already extracted and saved ${summary.perceptionsCreated} perception(s) and created ${summary.charactersCreated} character(s).

Respond naturally and conversationally. Be friendly, curious, and encourage them to share more. Keep it casual like texting a friend.`;

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      let accumulatedContent = assistantContent;
      await streamChat(
        `${contextPrompt}\n\nUser: ${message}`,
        conversationHistoryRef.current.slice(-5).map(m => ({ role: m.role, content: m.content })),
        (chunk: string) => {
          accumulatedContent += chunk;
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = accumulatedContent;
            }
            return updated;
          });
        },
        () => {},
        () => {
          setIsLoading(false);
          setIsExtracting(false);
          conversationHistoryRef.current.push({ role: 'assistant', content: accumulatedContent });
          if (summary.perceptionsCreated > 0) {
            onPerceptionsCreated?.();
          }
        },
        (error: string) => {
          console.error('Chat error:', error);
          setIsLoading(false);
          setIsExtracting(false);
        },
        {
          type: 'GOSSIP',
          id: 'gossip-session' // Special ID for gossip chat sessions
        }
      );
    } catch (error) {
      console.error('Error processing gossip:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Oops! Something went wrong. Try again?',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
      setIsExtracting(false);
    }
  }, [isLoading, isExtracting, streamChat, onPerceptionsCreated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-black/90 border border-orange-500/30 rounded-2xl shadow-panel w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-orange-500/30 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(255,165,0,0.35),_transparent)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <MessageSquare className="w-6 h-6 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-white">
                Gossip Chat
              </h2>
              <p className="text-sm text-white/60">Chat naturally, I'll extract and connect everything</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Extraction Status Banner */}
        {isExtracting && (
          <div className="px-6 py-3 bg-orange-500/10 border-b border-orange-500/30 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            <span className="text-sm text-orange-200">Extracting perceptions and connecting info...</span>
          </div>
        )}

        {lastExtraction && !isExtracting && (
          <div className="px-6 py-3 bg-green-500/10 border-b border-green-500/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-200">
              {lastExtraction.perceptionsCreated > 0 && `${lastExtraction.perceptionsCreated} perception(s) saved`}
              {lastExtraction.perceptionsCreated > 0 && lastExtraction.charactersCreated > 0 && ' • '}
              {lastExtraction.charactersCreated > 0 && `${lastExtraction.charactersCreated} character(s) created`}
            </span>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isExtracting && (
            <div className="flex items-center gap-2 text-orange-400/70 text-sm">
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>Analyzing and connecting information...</span>
            </div>
          )}
          <div ref={chatMessagesEndRef} />
        </div>

        {/* Chat Input */}
        <div className="border-t border-orange-500/30 pt-4 px-6 pb-6">
          <ChatComposer
            onSubmit={handleChatMessage}
            loading={isLoading || isExtracting}
            disabled={isLoading || isExtracting}
            placeholder="What did you hear? Just chat naturally..."
          />
        </div>
      </div>
    </div>
  );
};
