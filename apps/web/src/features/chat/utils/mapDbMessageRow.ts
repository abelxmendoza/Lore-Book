import type { Message } from '../message/ChatMessage';

export type DbChatMessageRow = {
  id: string;
  role: string;
  content?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Map a durable chat_messages row into the client Message shape. */
export function mapDbMessageRow(row: DbChatMessageRow): Message {
  const metadata = row.metadata ?? undefined;
  const mentionedEntities = Array.isArray(metadata?.mentionedEntities)
    ? (metadata.mentionedEntities as Message['mentionedEntities'])
    : undefined;

  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content ?? '',
    timestamp: row.created_at ? new Date(row.created_at) : new Date(),
    persistStatus: 'saved',
    ...(metadata ? { metadata } : {}),
    ...(mentionedEntities && mentionedEntities.length > 0 ? { mentionedEntities } : {}),
  };
}
