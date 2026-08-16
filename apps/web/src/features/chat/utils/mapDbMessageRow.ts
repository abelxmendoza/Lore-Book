import type { Message } from '../message/ChatMessage';

export type DbChatMessageRow = {
  id: string;
  role: string;
  content?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
  turn_number?: number | null;
  reply_seq?: number | null;
  ref?: string | null;
};

/** Map a durable chat_messages row into the client Message shape. */
export function mapDbMessageRow(row: DbChatMessageRow): Message {
  const metadata = row.metadata ?? undefined;
  const mentionedEntities = Array.isArray(metadata?.mentionedEntities)
    ? (metadata.mentionedEntities as Message['mentionedEntities'])
    : undefined;
  const creationOutcomes = Array.isArray(metadata?.creationOutcomes)
    ? (metadata.creationOutcomes as Message['creationOutcomes'])
    : undefined;
  const creationOutcomeSummary =
    typeof metadata?.creationOutcomeSummary === 'string'
      ? metadata.creationOutcomeSummary
      : metadata?.creationOutcomeSummary === null
        ? null
        : undefined;
  const staleProjectionHints = Array.isArray(metadata?.staleProjectionHints)
    ? (metadata.staleProjectionHints as Message['staleProjectionHints'])
    : undefined;
  const staleProjectionSummary =
    typeof metadata?.staleProjectionSummary === 'string'
      ? metadata.staleProjectionSummary
      : metadata?.staleProjectionSummary === null
        ? null
        : undefined;
  const sources = Array.isArray(metadata?.sources)
    ? (metadata.sources as Message['sources'])
    : undefined;
  const citations = Array.isArray(metadata?.citations)
    ? (metadata.citations as Message['citations'])
    : undefined;
  const recallSources = Array.isArray(metadata?.recall_sources)
    ? (metadata.recall_sources as Message['recall_sources'])
    : undefined;
  const ragStats = metadata?.ragStats && typeof metadata.ragStats === 'object'
    ? (metadata.ragStats as Message['ragStats'])
    : undefined;
  const responseMode = typeof metadata?.response_mode === 'string'
    ? metadata.response_mode
    : undefined;
  const streamStatus = typeof metadata?.stream_status === 'string' ? metadata.stream_status : undefined;
  // A stream interrupted before any tokens arrived is persisted with an
  // explicit fallback message and stream_status:'failed' (see
  // chatMessagePersistenceService.finalizeAssistantMessage) rather than being
  // silently deleted. Synthesize the same lifecycle shape a live failed send
  // would have so the existing delivery-notice UI (SystemNotice + "Retry
  // response") renders for it after reload, instead of building new UI.
  const failedLifecycle: Message['lifecycle'] | undefined =
    row.role === 'assistant' && streamStatus === 'failed'
      ? {
          localPersistence: 'saved',
          cloudPersistence: 'saved',
          processing: 'failed',
          summary: 'not_requested',
          retryCount: 0,
          updatedAt: row.created_at ?? new Date().toISOString(),
          lastError: {
            stage: 'generation',
            message: row.content || 'Response interrupted before it started.',
            retryable: true,
            occurredAt: row.created_at ?? new Date().toISOString(),
          },
        }
      : undefined;

  const rawAttachments = Array.isArray(metadata?.attachments)
    ? (metadata.attachments as NonNullable<Message['attachments']>)
    : undefined;
  // Prefer durable public URLs for display after reload
  const attachments = rawAttachments?.map((a) => ({
    ...a,
    // ensure url is top-level for bubble rendering
    url: a.url,
    dataUrl: a.dataUrl,
  }));

  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content ?? '',
    timestamp: row.created_at ? new Date(row.created_at) : new Date(),
    persistStatus: 'saved',
    ...(failedLifecycle ? { lifecycle: failedLifecycle } : {}),
    ...(row.turn_number != null ? { turnNumber: row.turn_number } : {}),
    ...(row.reply_seq != null ? { replySeq: row.reply_seq } : {}),
    ...(row.ref ? { ref: row.ref } : {}),
    ...(metadata ? { metadata } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(mentionedEntities && mentionedEntities.length > 0 ? { mentionedEntities } : {}),
    ...(creationOutcomes && creationOutcomes.length > 0 ? { creationOutcomes } : {}),
    ...(creationOutcomeSummary !== undefined ? { creationOutcomeSummary } : {}),
    ...(staleProjectionHints && staleProjectionHints.length > 0 ? { staleProjectionHints } : {}),
    ...(staleProjectionSummary !== undefined ? { staleProjectionSummary } : {}),
    ...(sources ? { sources } : {}),
    ...(citations ? { citations } : {}),
    ...(recallSources ? { recall_sources: recallSources } : {}),
    ...(ragStats ? { ragStats } : {}),
    ...(responseMode ? { response_mode: responseMode } : {}),
  };
}
