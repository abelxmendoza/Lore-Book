import { useEffect, useRef } from 'react';
import { ChatMessage, type Message, type ChatSource } from './ChatMessage';
import { groupMessagesByDate } from '../utils/messageGrouping';
import { scrollToMessage } from '../utils/scrollToMessage';

type ChatMessageListProps = {
  messages: Message[];
  streamingMessageId?: string | null;
  searchMessageId?: string | null;
  messageRefs: Map<string, HTMLDivElement>;
  onCopy?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onSourceClick?: (source: ChatSource) => void;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void;
  registerMessageRef?: (messageId: string, element: HTMLDivElement | null) => void;
};

export const ChatMessageList = ({
  messages,
  streamingMessageId,
  searchMessageId,
  messageRefs,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onSourceClick,
  onFeedback,
  registerMessageRef
}: ChatMessageListProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const groupedMessages = groupMessagesByDate(messages);

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
      <div className="mx-auto max-w-3xl px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date Header - ChatGPT style */}
            <div className="sticky top-0 z-10 flex items-center gap-2 sm:gap-4 my-4 sm:my-6">
              <div className="flex-1 border-t border-white/10" />
              <span className="text-xs text-white/40 font-medium px-2 sm:px-3 py-0.5 sm:py-1 bg-black/40 rounded-full border border-white/10">
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
                  onCopy={onCopy ? () => onCopy(message.id) : undefined}
                  onRegenerate={message.role === 'assistant' && onRegenerate ? () => onRegenerate(message.id) : undefined}
                  onEdit={message.role === 'user' && onEdit ? () => onEdit(message.id) : undefined}
                  onDelete={onDelete ? () => onDelete(message.id) : undefined}
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

