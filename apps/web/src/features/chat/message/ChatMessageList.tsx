import { useEffect, useRef, useState } from 'react';
import { ChatMessage, type Message, type ChatSource, type ChatSuggestedAction } from './ChatMessage';
import { groupMessagesByDate } from '../utils/messageGrouping';
import { scrollToMessage } from '../utils/scrollToMessage';
import type { EntityMentionRef } from '../../../lib/entityMentions';
import { entityMentionsFromMessage } from '../../../lib/entityMentions';

function buildThreadMentionContext(messages: Message[]): Map<string, EntityMentionRef[]> {
  const known = new Map<string, EntityMentionRef>();
  const byMessage = new Map<string, EntityMentionRef[]>();

  for (const message of messages) {
    for (const entity of entityMentionsFromMessage(message)) {
      known.set(entity.id, entity);
    }
    byMessage.set(message.id, [...known.values()]);
  }

  return byMessage;
}

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
  onSuggestedAction?: (action: ChatSuggestedAction, message: Message) => void;
  onPrefillComposer?: (prompt: string) => void;
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
  onSuggestedAction,
  onPrefillComposer,
  registerMessageRef
}: ChatMessageListProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousLastMessageIdRef = useRef<string | null>(null);
  const previousCountRef = useRef(0);
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const groupedMessages = groupMessagesByDate(messages);
  const threadMentionContext = buildThreadMentionContext(messages);

  // Animate newly appended messages (skip bulk thread hydration)
  useEffect(() => {
    const prevCount = previousCountRef.current;
    const delta = messages.length - prevCount;
    previousCountRef.current = messages.length;

    if (delta <= 0 || delta > 3) return;

    const newIds = messages.slice(-delta).map((m) => m.id);
    setEnteringIds(new Set(newIds));
    const timer = window.setTimeout(() => setEnteringIds(new Set()), 650);
    return () => window.clearTimeout(timer);
  }, [messages]);

  // Scroll to bottom on thread/message switches and while the user is already
  // near the bottom. Avoid yanking position on every streaming chunk.
  useEffect(() => {
    if (!containerRef.current || messages.length === 0) return;
    const container = containerRef.current;
    const lastMessageId = messages[messages.length - 1]?.id ?? null;
    const lastMessageChanged = previousLastMessageIdRef.current !== lastMessageId;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom < 160;

    if (lastMessageChanged || isNearBottom) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }

    previousLastMessageIdRef.current = lastMessageId;
  }, [messages, streamingMessageId]);

  // Scroll to search result
  useEffect(() => {
    if (searchMessageId) {
      scrollToMessage(searchMessageId, containerRef, messageRefs);
    }
  }, [searchMessageId, messageRefs]);

  return (
    <div 
      ref={containerRef}
      className="chat-conversation-canvas flex-1 overflow-y-auto chat-scrollbar"
    >
      <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-3 sm:px-6 lg:px-10 xl:px-12 py-4 sm:py-8 lg:py-12 xl:py-16 space-y-4 sm:space-y-8 lg:space-y-10 xl:space-y-12">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date Header - ChatGPT style */}
            <div className="sticky top-0 z-10 flex items-center gap-3 sm:gap-4 lg:gap-6 my-6 sm:my-8 lg:my-10 chat-date-header-enter">
              <div className="flex-1 border-t border-white/10" />
              <span className="chat-date-pill text-xs sm:text-sm text-white/40 font-medium px-3 sm:px-4 py-1 sm:py-1.5 rounded-full">
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
                className={`w-full min-w-0 ${message.id === searchMessageId ? 'ring-2 ring-primary/50 rounded-lg -mx-2 px-2' : ''}`}
              >
                <ChatMessage
                  message={message}
                  threadEntityMentions={threadMentionContext.get(message.id) ?? []}
                  animateEnter={enteringIds.has(message.id)}
                  showCognitiveTrace={showCognitiveTrace}
                  onCopy={onCopy ? () => onCopy(message.id) : undefined}
                  onRegenerate={message.role === 'assistant' && onRegenerate ? () => onRegenerate(message.id) : undefined}
                  onEdit={message.role === 'user' && onEdit ? () => onEdit(message.id) : undefined}
                  onDelete={onDelete ? () => onDelete(message.id) : undefined}
                  onFork={onFork ? () => onFork(message.id) : undefined}
                  onSourceClick={onSourceClick}
                  onFeedback={onFeedback}
                  onSuggestedAction={onSuggestedAction}
                  onPrefillComposer={onPrefillComposer}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
