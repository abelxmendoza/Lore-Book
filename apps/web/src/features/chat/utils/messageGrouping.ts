import type { Message } from '../message/ChatMessage';

export type MessageGroup = {
  date: string;
  dateLabel: string;
  messages: Message[];
};

function coerceMessageDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Groups messages by date with sticky date headers
 */
export const groupMessagesByDate = (messages: Message[]): MessageGroup[] => {
  const groups: Record<string, Message[]> = {};
  
  messages.forEach((msg) => {
    const date = coerceMessageDate(msg.timestamp).toLocaleDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(msg);
  });

  const today = new Date().toLocaleDateString();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();

  return Object.entries(groups)
    .map(([date, dateMessages]) => ({
      date,
      dateLabel: 
        date === today ? 'Today' :
        date === yesterday ? 'Yesterday' :
        date,
      messages: dateMessages
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};
