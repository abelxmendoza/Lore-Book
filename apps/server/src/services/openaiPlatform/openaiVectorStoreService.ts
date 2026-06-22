import { config } from '../../config';
import { openai } from '../../lib/openai';
import { toFile } from 'openai';
import { logger } from '../../logger';
import { loadOpenAiSessionState, mergeOpenAiSessionState } from './openaiSessionState';

export async function resolveVectorStoreIdForSession(
  userId: string,
  sessionId: string,
): Promise<string | undefined> {
  if (!config.openAiVectorStoreEnabled) return undefined;

  if (config.openAiVectorStoreId?.trim()) {
    return config.openAiVectorStoreId.trim();
  }

  const state = await loadOpenAiSessionState(userId, sessionId);
  if (state.vector_store_id) return state.vector_store_id;

  try {
    const store = await openai.vectorStores.create({
      name: `lorekeeper-${userId.slice(0, 8)}`,
      metadata: { user_id: userId, session_id: sessionId },
    });
    await mergeOpenAiSessionState(userId, sessionId, { vector_store_id: store.id });
    return store.id;
  } catch (err) {
    logger.warn({ err, userId, sessionId }, 'Failed to create OpenAI vector store');
    return undefined;
  }
}

export function buildFileSearchTool(vectorStoreId: string) {
  return {
    type: 'file_search' as const,
    vector_store_ids: [vectorStoreId],
  };
}

export async function uploadTextToVectorStore(params: {
  userId: string;
  sessionId: string;
  filename: string;
  content: string;
}): Promise<{ fileId: string; vectorStoreId: string } | undefined> {
  if (!config.openAiVectorStoreEnabled) {
    throw new Error('OpenAI vector stores are disabled (OPENAI_VECTOR_STORE_ENABLED)');
  }

  const vectorStoreId = await resolveVectorStoreIdForSession(params.userId, params.sessionId);
  if (!vectorStoreId) return undefined;

  const file = await openai.files.create({
    file: await toFile(Buffer.from(params.content, 'utf8'), params.filename, { type: 'text/plain' }),
    purpose: 'assistants',
  });

  await openai.vectorStores.files.create(vectorStoreId, { file_id: file.id });
  return { fileId: file.id, vectorStoreId };
}
