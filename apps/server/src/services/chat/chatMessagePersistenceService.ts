/**
 * Durable chat_messages writes for stream and non-stream paths.
 * Returns structured results so routes can surface persistence truth to clients.
 *
 * Streaming persistence follows provider guidance:
 * - OpenAI: accumulate `delta.content`, persist after stream ends; handle usage-only
 *   final chunk when `stream_options.include_usage` is set.
 *   https://developers.openai.com/cookbook/examples/how_to_stream_completions
 * - Anthropic (conceptual parity): Messages API is stateless — Lorekeeper stores
 *   full history and persists assistant text after `message_stop` equivalent.
 *   https://platform.claude.com/docs/en/build-with-claude/working-with-messages
 *   https://platform.claude.com/docs/en/build-with-claude/streaming
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type PersistRole = 'user' | 'assistant';

export type MessagePersistResult = {
  saved: boolean;
  id?: string;
  error?: string;
  role: PersistRole;
};

export type AssistantFinalizeInput = {
  userId: string;
  sessionId: string;
  assistantRowId: string | null;
  content: string;
  metadata: Record<string, unknown>;
  status: 'complete' | 'partial' | 'failed';
};

async function runWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err, label }, 'chatMessagePersistence: retrying after failure');
    return await fn();
  }
}

/** Insert empty assistant placeholder at stream start. */
export async function insertAssistantPlaceholder(
  userId: string,
  sessionId: string
): Promise<MessagePersistResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        user_id: userId,
        session_id: sessionId,
        role: 'assistant',
        content: '',
        metadata: { saved_from_stream: true, stream_status: 'streaming' },
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      const msg = error?.message ?? 'No id returned';
      logger.warn({ err: error, userId, sessionId }, 'Assistant placeholder insert failed');
      return { saved: false, role: 'assistant', error: msg };
    }
    return { saved: true, id: data.id, role: 'assistant' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, userId, sessionId }, 'Assistant placeholder insert threw');
    return { saved: false, role: 'assistant', error: msg };
  }
}

/** Remove blank placeholder when stream produced no assistant text. */
export async function deleteAssistantPlaceholder(userId: string, assistantRowId: string): Promise<void> {
  try {
    await supabaseAdmin.from('chat_messages').delete().eq('id', assistantRowId).eq('user_id', userId);
  } catch (err) {
    logger.warn({ err, assistantRowId, userId }, 'Failed to delete empty assistant placeholder');
  }
}

/** Update placeholder or insert assistant row with final/partial content. */
export async function finalizeAssistantMessage(
  input: AssistantFinalizeInput
): Promise<MessagePersistResult> {
  const trimmed = input.content.trim();
  if (!trimmed) {
    if (input.assistantRowId) {
      await deleteAssistantPlaceholder(input.userId, input.assistantRowId);
    }
    return { saved: false, role: 'assistant', error: 'empty_content' };
  }

  const rowMetadata = {
    ...input.metadata,
    saved_from_stream: true,
    stream_status: input.status,
  };

  try {
    if (input.assistantRowId) {
      const { error } = await runWithRetry('assistant-update', async () =>
        supabaseAdmin
          .from('chat_messages')
          .update({ content: input.content, metadata: rowMetadata })
          .eq('id', input.assistantRowId!)
          .eq('user_id', input.userId)
      );
      if (error) {
        logger.error({ err: error, sessionId: input.sessionId }, 'Failed to update assistant message');
        return { saved: false, id: input.assistantRowId, role: 'assistant', error: error.message };
      }
    } else {
      const { data, error } = await runWithRetry('assistant-insert', async () =>
        supabaseAdmin
          .from('chat_messages')
          .insert({
            user_id: input.userId,
            session_id: input.sessionId,
            role: 'assistant',
            content: input.content,
            metadata: rowMetadata,
          })
          .select('id')
          .single()
      );
      if (error || !data?.id) {
        const msg = error?.message ?? 'No id returned';
        logger.error({ err: error, sessionId: input.sessionId }, 'Failed to insert assistant message');
        return { saved: false, role: 'assistant', error: msg };
      }
      input.assistantRowId = data.id;
    }

    await supabaseAdmin
      .from('conversation_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', input.sessionId)
      .eq('user_id', input.userId);

    return { saved: true, id: input.assistantRowId ?? undefined, role: 'assistant' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, sessionId: input.sessionId }, 'Assistant finalize threw');
    return { saved: false, id: input.assistantRowId ?? undefined, role: 'assistant', error: msg };
  }
}

export function userPersistResult(messageId: string | undefined): MessagePersistResult {
  if (messageId) {
    return { saved: true, id: messageId, role: 'user' };
  }
  return { saved: false, role: 'user', error: 'user_message_not_persisted' };
}
