import { useEffect, useRef } from 'react';
import { ChatMessage, type Message, type ChatSource } from './ChatMessage';
import { groupMessagesByDate } from '../utils/messageGrouping';
import { scrollToMessage } from '../utils/scrollToMessage';

type ChatMessageListProps = {
  messages: Message[];
  streamingMessageId?: string | null;
  searchMessageId?: string | null;
  messageRefs: Map<string, HTMLDivElement>;
  showCognitiveTrace?: boolean;
  onCopy?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onSourceClick?: (source: ChatSource) => void;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void;
  onFork?: (messageId: string) => void;
  registerMessageRef?: (messageId: string, element: HTMLDivElement | null) => void;
};

export const ChatMessageList = ({
  messages,
  streamingMessageId,
  searchMessageId,
  messageRefs,
  showCognitiveTrace = false,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onSourceClick,
  onFeedback,
  onFork,
  registerMessageRef
}: ChatMessageListProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const groupedMessages = groupMessagesByDate(messages);

  // Scroll to bottom when messages change (new message, streaming update, thread switch)
  useEffect(() => {
    if (!containerRef.current || messages.length === 0) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [messages]);

  // Scroll to search result
  useEffect(() => {
    if (searchMessageId) {
      scrollToMessage(searchMessageId, containerRef, messageRefs);
    }
  }, [searchMessageId, messageRefs]);

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-y-auto chat-scrollbar"
    >
      <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-8 lg:py-12 xl:py-16 space-y-6 sm:space-y-8 lg:space-y-10 xl:space-y-12">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date Header - ChatGPT style */}
            <div className="sticky top-0 z-10 flex items-center gap-3 sm:gap-4 lg:gap-6 my-6 sm:my-8 lg:my-10">
              <div className="flex-1 border-t border-white/10" />
              <span className="text-xs sm:text-sm text-white/40 font-medium px-3 sm:px-4 py-1 sm:py-1.5 bg-black/40 rounded-full border border-white/10">
                {group.dateLabel}
              </span>
              <div className="flex-1 border-t border-white/10" />
            </div>
            
            {/* Messages for this date */}
            {group.messages.map((message) => (
              <div
                key={message.id}
                ref={(el) => {
                  if (registerMessageRef) {
                    registerMessageRef(message.id, el);
                  } else if (el) {
                    messageRefs.set(message.id, el);
                  } else {
                    messageRefs.delete(message.id);
                  }
                }}
                className={message.id === searchMessageId ? 'ring-2 ring-primary/50 rounded-lg -mx-2 px-2' : ''}
              >
                <ChatMessage
                  message={message}
                  showCognitiveTrace={showCognitiveTrace}
                  onCopy={onCopy ? () => onCopy(message.id) : undefined}
                  onRegenerate={message.role === 'assistant' && onRegenerate ? () => onRegenerate(message.id) : undefined}
                  onEdit={message.role === 'user' && onEdit ? () => onEdit(message.id) : undefined}
                  onDelete={onDelete ? () => onDelete(message.id) : undefined}
                  onFork={onFork ? () => onFork(message.id) : undefined}
                  onSourceClick={onSourceClick}
                  onFeedback={onFeedback}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

