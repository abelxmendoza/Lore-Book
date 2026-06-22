import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

/** OpenAI-managed state mirrored in conversation_sessions.metadata.openai */
export type OpenAiSessionMeta = {
  last_response_id?: string;
  openai_conversation_id?: string;
  vector_store_id?: string;
  background_jobs?: Array<{
    response_id: string;
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
    created_at: string;
    completed_at?: string;
    error?: string;
  }>;
};

type SessionMetadata = Record<string, unknown> & { openai?: OpenAiSessionMeta };

function readOpenAiMeta(metadata: unknown): OpenAiSessionMeta {
  if (!metadata || typeof metadata !== 'object') return {};
  const openai = (metadata as SessionMetadata).openai;
  if (!openai || typeof openai !== 'object') return {};
  return { ...openai };
}

export async function loadOpenAiSessionState(
  userId: string,
  sessionId: string,
): Promise<OpenAiSessionMeta> {
  const { data, error } = await supabaseAdmin
    .from('conversation_sessions')
    .select('metadata')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn({ err: error, userId, sessionId }, 'Failed to load OpenAI session state');
    return {};
  }
  return readOpenAiMeta(data?.metadata);
}

export async function mergeOpenAiSessionState(
  userId: string,
  sessionId: string,
  patch: Partial<OpenAiSessionMeta>,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('conversation_sessions')
    .select('metadata')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    logger.warn({ err: error, userId, sessionId }, 'Failed to merge OpenAI session state');
    return;
  }

  const metadata = (data.metadata && typeof data.metadata === 'object'
    ? { ...(data.metadata as SessionMetadata) }
    : {}) as SessionMetadata;
  const current = readOpenAiMeta(metadata);
  metadata.openai = { ...current, ...patch };

  const { error: updateError } = await supabaseAdmin
    .from('conversation_sessions')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (updateError) {
    logger.warn({ err: updateError, userId, sessionId }, 'Failed to persist OpenAI session state');
  }
}

export function isOpenAiPlatformEnabled(flags: {
  responseChaining?: boolean;
  conversationsApi?: boolean;
  backgroundResponses?: boolean;
  vectorStoreEnabled?: boolean;
  useCompactApi?: boolean;
  webhookSecret?: string;
}): boolean {
  return Boolean(
    flags.responseChaining ||
      flags.conversationsApi ||
      flags.backgroundResponses ||
      flags.vectorStoreEnabled ||
      flags.useCompactApi ||
      flags.webhookSecret,
  );
}
