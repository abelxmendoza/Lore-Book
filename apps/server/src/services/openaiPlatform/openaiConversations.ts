import { config } from '../../config';
import { openai } from '../../lib/openai';
import { logger } from '../../logger';
import { loadOpenAiSessionState, mergeOpenAiSessionState } from './openaiSessionState';

/** Ensure an OpenAI `conv_...` exists when OPENAI_CONVERSATIONS_API is enabled. */
export async function ensureOpenAiConversation(
  userId: string,
  sessionId: string,
  title?: string,
): Promise<string | undefined> {
  if (!config.openAiConversationsApi) return undefined;

  const state = await loadOpenAiSessionState(userId, sessionId);
  if (state.openai_conversation_id) return state.openai_conversation_id;

  try {
    const conversation = await openai.conversations.create({
      metadata: {
        lorekeeper_user_id: userId,
        lorekeeper_session_id: sessionId,
        ...(title ? { title } : {}),
      },
    });
    await mergeOpenAiSessionState(userId, sessionId, {
      openai_conversation_id: conversation.id,
    });
    return conversation.id;
  } catch (err) {
    logger.warn({ err, userId, sessionId }, 'Failed to create OpenAI conversation');
    return undefined;
  }
}
